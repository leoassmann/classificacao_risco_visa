// Configuração do worker para pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// --- CONSTANTES E VARIÁVEIS DE ESTADO ---
const CLASSIFICATION_COLORS = { "ALTO": "FF0000", "MÉDIO": "FFFF00" };
const COLUMN_WIDTHS = { "DESCRICAO": 85 };

// Mapeamento de colunas para classes de largura do Tailwind CSS
const TABLE_COLUMN_WIDTH_CLASSES = {
    'CNAE': 'w-[150px]',
    'DESCRICAO': 'w-auto',
    'GRAU_RISCO': 'w-[200px]',
    'CONDICIONANTES': 'w-[250px]'
};

// Mapeamento para exibir nomes de colunas personalizados na tela
const COLUMN_DISPLAY_NAMES = {
    'CNAE': 'CNAE',
    'DESCRICAO': 'Descrição da Atividade',
    'GRAU_RISCO': 'Classificação',
    'CONDICIONANTES': 'Condicionantes'
};
const REGEX_CNAE_FORMATO = /\b\d{2}\.?\d{2}[\s.\/-]?\d{1}[\s.\/-]?\d{2}\b|\b\d{7}\b/g;

let pdfFile = null;
let baseDataFromStorage = null;
let finalResults = [];
let activeInputMethod = 'pdf'; // 'pdf' ou 'text'

// Variáveis de estado para a tabela interativa
let currentSort = { column: null, direction: 'none' };
let currentFilters = {};
let filterDebounceTimer = null;

// --- SELETORES DE ELEMENTOS DO DOM ---
const dom = {
    initialView: document.getElementById('initial-view'),
    backButton: document.getElementById('back-button'),
    pdfDropArea: document.getElementById('pdf-drop-area'),
    pdfInitialState: document.getElementById('pdf-initial-state'),
    pdfLoadedState: document.getElementById('pdf-loaded-state'),
    pdfFileName: document.getElementById('pdf-file-name'),
    pdfFileInput: document.getElementById('pdf-file-input'),
    cnaeTextInput: document.getElementById('cnae-text-input'),
    removePdfButton: document.getElementById('remove-pdf-button'),
    processButton: document.getElementById('process-button'),
    statusContainer: document.getElementById('status-container'),
    resultsArea: document.getElementById('results-area'),
    resultsHeader: document.getElementById('results-header'),
    resultsBody: document.getElementById('results-body'),
    downloadButton: document.getElementById('download-button'),
    toastContainer: document.getElementById('toast-container'),
    themeToggleBtn: document.getElementById('theme-toggle'),
    themeToggleDarkIcon: document.getElementById('theme-toggle-dark-icon'),
    themeToggleLightIcon: document.getElementById('theme-toggle-light-icon'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    mainContent: document.getElementById('main-content'),
    submenuToggles: document.querySelectorAll('.submenu-toggle'),
    pdfTab: document.getElementById('pdf-tab'),
    textTab: document.getElementById('text-tab'),
    pdfPanel: document.getElementById('pdf-panel'),
    textPanel: document.getElementById('text-panel'),
};

// --- FUNÇÕES DE UI ---

/** Mostra uma notificação (toast) na tela. */
function showToast(message, type = 'info') {
    const icons = {
        success: `<svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
        error: `<svg class="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
        info: `<svg class="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
    };
    const colors = { success: 'border-green-500', error: 'border-red-500', info: 'border-blue-500' };
    const toast = document.createElement('div');
    toast.className = `toast bg-white dark:bg-gray-800 border-l-4 ${colors[type]} rounded-lg shadow-lg p-4 flex items-center gap-4`;
    toast.innerHTML = `${icons[type]}<span class="text-gray-700 dark:text-gray-300">${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

/** Exibe uma mensagem de status no painel principal. */
function logStatus(message, type = 'info') {
    const colors = { info: 'text-gray-500 dark:text-gray-400', success: 'text-green-500 dark:text-green-400', error: 'text-red-500 dark:text-red-400', loading: 'text-blue-500 dark:text-blue-400' };
    const div = document.createElement('div');
    div.className = `flex items-center justify-center gap-3 ${colors[type]}`;
    if (type === 'loading') {
        div.innerHTML = `<div class="loader" style="width: 20px; height: 20px; border-width: 2px;"></div><span>${message}</span>`;
    } else {
        div.textContent = message;
    }
    dom.statusContainer.appendChild(div);
}

/** Limpa todas as mensagens de status. */
function clearStatus() { dom.statusContainer.innerHTML = ''; }

/** Atualiza a UI com base no estado atual dos arquivos. */
function updateUI() {
    const hasPdf = !!pdfFile;
    const hasText = dom.cnaeTextInput && dom.cnaeTextInput.value.trim().length > 0;

    dom.pdfInitialState.classList.toggle('hidden', hasPdf);
    dom.pdfLoadedState.classList.toggle('hidden', !hasPdf);
    if (hasPdf) {
        dom.pdfFileName.textContent = pdfFile.name;
        dom.pdfFileName.title = pdfFile.name;
    }
    dom.processButton.disabled = !(baseDataFromStorage && (hasPdf || hasText));
}

/** Cria o cabeçalho da tabela de resultados, incluindo filtros e ordenação. Só deve ser chamado uma vez. */
function createResultsHeader() {
    dom.resultsHeader.innerHTML = '';
    if (finalResults.length === 0) return; // Não cria cabeçalho se não há dados

    const headers = Object.keys(finalResults[0]);
    const interactiveHeaders = ['CNAE', 'DESCRICAO', 'GRAU_RISCO', 'CONDICIONANTES'];

    // Cria o cabeçalho interativo
    headers.forEach(header => {
        const th = document.createElement('th');
        const widthClass = TABLE_COLUMN_WIDTH_CLASSES[header] || 'w-auto'; // Pega a classe de largura ou usa 'w-auto' como padrão
        th.className = `p-3 text-xs font-semibold tracking-wide text-left text-gray-700 dark:text-gray-300 ${widthClass}`;
        
        const headerContent = document.createElement('div');
        headerContent.className = 'flex flex-col gap-2';

        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex items-center gap-1';

        const titleSpan = document.createElement('span');
        const displayName = COLUMN_DISPLAY_NAMES[header] || (header.charAt(0).toUpperCase() + header.slice(1));
        titleSpan.textContent = displayName;

        if (interactiveHeaders.includes(header)) {
            titleSpan.className = 'cursor-pointer hover:text-indigo-500';
            titleSpan.dataset.column = header;

            const sortIcon = document.createElement('span');
            sortIcon.className = 'text-indigo-500 font-mono';
            if (currentSort.column === header) {
                sortIcon.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
            }
            titleContainer.appendChild(titleSpan);
            titleContainer.appendChild(sortIcon);
        } else {
            titleContainer.appendChild(titleSpan);
        }
        
        headerContent.appendChild(titleContainer);

        if (interactiveHeaders.includes(header)) {
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.placeholder = `Filtrar por ${displayName}...`;
            filterInput.dataset.column = header;
            filterInput.className = 'w-full p-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500';
            filterInput.value = currentFilters[header] || '';
            headerContent.appendChild(filterInput);
        }

        th.appendChild(headerContent);
        dom.resultsHeader.appendChild(th);
    });    
}

/** Renderiza apenas o corpo (linhas) da tabela de resultados. */
function renderResultsBody(data) {
    dom.resultsBody.innerHTML = ''; // Limpa apenas as linhas existentes

    if (finalResults.length === 0) return; // Se não há dados originais, não há o que renderizar.
    const headers = Object.keys(finalResults[0]); // Define os cabeçalhos a partir dos dados originais
    
    // Preenche o corpo da tabela
    data.forEach(row => {
        const tr = document.createElement('tr');
        const classification = row.GRAU_RISCO?.toUpperCase() || '';
        let rowColorClass = '';
        if (classification.includes("ALTO")) rowColorClass = 'bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/50';
        else if (classification.includes("MÉDIO")) rowColorClass = 'bg-yellow-100 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-800/50';
        tr.className = `border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 ${rowColorClass}`;

        headers.forEach(header => {
            const td = document.createElement('td');
            let cellClasses = "p-3 text-sm text-gray-600 dark:text-gray-400 align-top break-words";
            if (header.toUpperCase() === 'CNAE') {
                cellClasses += " whitespace-nowrap font-mono";
            }

            td.className = cellClasses;
            td.textContent = row[header];
            tr.appendChild(td);
        });
        dom.resultsBody.appendChild(tr);
    });
    dom.resultsArea.classList.remove('hidden');
    updateUI(); // Garante que a UI reflita o estado atual
}

/** Alterna entre a visão inicial (inputs) e a visão de resultados. */
function toggleView(showResults) {
    dom.initialView.classList.toggle('hidden', showResults);
    dom.resultsArea.classList.toggle('hidden', !showResults);
    // Limpa os resultados e o cabeçalho ao voltar para a visão inicial
    if (!showResults) dom.resultsHeader.innerHTML = '';
}

/** Aplica os filtros e a ordenação atuais e renderiza apenas o corpo da tabela. */
function applyFiltersAndSort() {
    let processedData = [...finalResults];

    // Aplicar filtros
    Object.keys(currentFilters).forEach(column => { // Itera sobre as chaves de currentFilters
        const filterValue = currentFilters[column];
        if (filterValue) {
            processedData = processedData.filter(row =>
                String(row[column]).toLowerCase().includes(filterValue)
            );
        }
    });

    // Aplicar ordenação
    if (currentSort.column && currentSort.direction !== 'none') {
        processedData.sort((a, b) => {
            const valA = a[currentSort.column];
            const valB = b[currentSort.column];
            const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
            return currentSort.direction === 'asc' ? comparison : -comparison;
        });
    }

    renderResultsBody(processedData); // Renderiza apenas o corpo da tabela
}

// --- MANIPULAÇÃO DE ARQUIVOS ---

function setupDragAndDrop(area, input, handler) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => area.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(eventName => area.addEventListener(eventName, () => area.classList.add('dragover'), false));
    ['dragleave', 'drop'].forEach(eventName => area.addEventListener(eventName, () => area.classList.remove('dragover'), false));
    area.addEventListener('drop', (e) => handler(e.dataTransfer.files[0]), false);
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handler(e.target.files[0]);
        e.target.value = '';
    });
}

function validateFile(file, allowedExtensions) {
    if (!file) return false;
    const extension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
        showToast(`Arquivo inválido. Use: ${allowedExtensions.join(', ')}`, 'error');
        return false;
    }
    return true;
}

function handlePdfFile(file) {
    if (!validateFile(file, ['pdf'])) return;
    pdfFile = file;
    updateUI();
}

function removePdfFile() {
    pdfFile = null;
    showToast('Arquivo PDF removido.', 'info');
    updateUI();
}

// --- LÓGICA DE CARREGAMENTO DA BASE ---

async function loadFixedExcelFile() {
    logStatus('Carregando base de dados...', 'loading');
    try {
        const response = await fetch('pmf/base de dados-pmf.xlsx');
        if (!response.ok) throw new Error(`Não foi possível carregar o arquivo: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Converte para JSON, mas com a opção de não gerar cabeçalhos automaticamente
        const jsonWithArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Pega os cabeçalhos originais e os dados
        const dataRows = jsonWithArray.slice(1);
        const expectedHeaders = ['CNAE', 'DESCRICAO', 'GRAU_RISCO', 'CONDICIONANTES'];

        // Mapeia os dados para os cabeçalhos esperados, garantindo a ordem
        const jsonData = dataRows.map(row => Object.fromEntries(expectedHeaders.map((key, i) => [key, row[i]])));
        
        baseDataFromStorage = jsonData;
        clearStatus();
        logStatus('Base de dados carregada com sucesso!', 'success');
        setTimeout(clearStatus, 3000);
        updateUI();
    } catch (error) {
        console.error('Erro ao carregar base de dados:', error);
        clearStatus();
        logStatus('Erro fatal ao carregar a base de dados.', 'error');
        showToast(`Erro ao carregar a base: ${error.message}`, 'error');
        baseDataFromStorage = null;
    }
}

// --- LÓGICA PRINCIPAL DE PROCESSAMENTO ---

function cleanCnae(cnae) { return String(cnae).replace(/\D/g, ''); }

async function readPdfFile(file) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument(data).promise;
    const cnaesEncontrados = new Map(); // Usar Map para guardar { limpo => original }
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        const matches = pageText.match(REGEX_CNAE_FORMATO) || [];
        matches.forEach(cnaeOriginal => {
            const cnaeLimpo = cleanCnae(cnaeOriginal);
            if (!cnaesEncontrados.has(cnaeLimpo)) {
                cnaesEncontrados.set(cnaeLimpo, cnaeOriginal);
            }
        });
    }
    return cnaesEncontrados;
}

function readTextCnaes(text) {
    const cnaesEncontrados = new Map(); // Usar Map para guardar { limpo => original }
    if (!text) return cnaesEncontrados;

    const matches = text.match(REGEX_CNAE_FORMATO) || [];
    matches.forEach(cnaeOriginal => {
        const cnaeLimpo = cleanCnae(cnaeOriginal);
        if (!cnaesEncontrados.has(cnaeLimpo)) {
            cnaesEncontrados.set(cnaeLimpo, cnaeOriginal);
        }
    });

    return cnaesEncontrados;
}

async function handleProcessing() {
    clearStatus();
    toggleView(false); // Garante que a view de resultados está escondida
    dom.processButton.disabled = true;
    
    try {
        logStatus('Validando base de dados...', 'loading');
        const requiredColumns = ['CNAE', 'DESCRICAO', 'GRAU_RISCO', 'CONDICIONANTES'];
        if (!baseDataFromStorage || baseDataFromStorage.length === 0 || !requiredColumns.every(col => baseDataFromStorage[0] && col in baseDataFromStorage[0])) {
            throw new Error(`Base de dados inválida ou não carregada. Verifique as colunas. Tente recarregar a página.`);
        }
        logStatus('Base de dados validada.', 'success');
        
        logStatus('Extraindo CNAEs do PDF...', 'loading');
        let pdfCnaesMap;
        if (activeInputMethod === 'pdf' && pdfFile) {
            logStatus('Extraindo CNAEs do PDF...', 'loading');
            pdfCnaesMap = await readPdfFile(pdfFile);
        } else if (activeInputMethod === 'text') {
            logStatus('Extraindo CNAEs do texto...', 'loading');
            pdfCnaesMap = readTextCnaes(dom.cnaeTextInput.value);
        }

        logStatus(`${pdfCnaesMap.size} CNAEs únicos encontrados no PDF.`, 'success');

        logStatus('Comparando arquivos...', 'loading');
        const baseDataWithCleanCnae = baseDataFromStorage.map(row => ({ ...row, NumerosBase: cleanCnae(row.CNAE) }));
        const pdfCnaesSet = new Set(pdfCnaesMap.keys());

        // 1. Encontrar correspondências
        const correspondencias = baseDataWithCleanCnae.filter(row => pdfCnaesSet.has(row.NumerosBase));
        const cnaesEncontradosNaBase = new Set(correspondencias.map(row => row.NumerosBase));

        // 2. Encontrar CNAEs do PDF que NÃO estão na base
        const cnaesNaoEncontrados = [];
        for (const cnaeLimpo of pdfCnaesSet) {
            if (!cnaesEncontradosNaBase.has(cnaeLimpo)) {
                cnaesNaoEncontrados.push({
                    CNAE: pdfCnaesMap.get(cnaeLimpo), // Pega o formato original
                    DESCRICAO: 'Atividade não encontrada na base de dados',
                    GRAU_RISCO: 'Alto',
                    CONDICIONANTES: ''
                });
            }
        }
        finalResults = [...correspondencias.map(({ NumerosBase, ...rest }) => rest), ...cnaesNaoEncontrados];

        clearStatus();
        if (finalResults.length > 0) {
            showToast(`${finalResults.length} correspondências encontradas!`, 'success');
            // Reseta filtros e ordenação, cria o cabeçalho e renderiza o corpo da tabela
            currentFilters = {};
            currentSort = { column: null, direction: 'none' };
            createResultsHeader(); // Cria o cabeçalho interativo uma única vez
            applyFiltersAndSort();
            toggleView(true); // Mostra a view de resultados
        } else {
            showToast('Nenhuma correspondência encontrada entre os arquivos.', 'info');
        }

    } catch (error) {
        console.error('Erro no processamento:', error);
        clearStatus();
        showToast(`Ocorreu um erro: ${error.message}`, 'error');
    } finally {
        dom.processButton.disabled = false;
        updateUI();
    }
}

async function downloadResults() {
    if (finalResults.length === 0) return;
    showToast('Gerando arquivo Excel...', 'info');
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Resultados');

    const headers = Object.keys(finalResults[0]);
    worksheet.columns = headers.map(header => ({ 
        header: COLUMN_DISPLAY_NAMES[header] || (header.charAt(0).toUpperCase() + header.slice(1)), 
        key: header, 
        width: COLUMN_WIDTHS[header] || 25 
    }));

    finalResults.forEach(row => {
        const addedRow = worksheet.addRow(row);
        const classification = row.GRAU_RISCO?.toUpperCase() || '';
        let color = null;
        if (classification.includes("ALTO")) color = CLASSIFICATION_COLORS["ALTO"];
        else if (classification.includes("MÉDIO")) color = CLASSIFICATION_COLORS["MÉDIO"];
        if (color) {
            addedRow.eachCell({ includeEmpty: true }, cell => { 
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; 
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'resultado_validacao_pmf.xlsx');
    
    showToast('Download concluído!', 'success');
}

// --- INICIALIZAÇÃO DE COMPONENTES DE UI ---

function initializeTheme() {
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            dom.themeToggleLightIcon.classList.remove('hidden');
            dom.themeToggleDarkIcon.classList.add('hidden');
        } else {
            document.documentElement.classList.remove('dark');
            dom.themeToggleLightIcon.classList.add('hidden');
            dom.themeToggleDarkIcon.classList.remove('hidden');
        }
    };

    dom.themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        applyTheme(isDark ? 'dark' : 'light');
    });

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
}

function initializeSidebar() {
    dom.sidebarToggle.addEventListener('click', () => {
        dom.sidebar.classList.toggle('w-64');
        dom.sidebar.classList.toggle('w-16');
        dom.sidebar.classList.toggle('sidebar-collapsed');
        dom.mainContent.classList.toggle('ml-64');
        dom.mainContent.classList.toggle('ml-16');
    });

    dom.submenuToggles.forEach(button => {
        button.addEventListener('click', () => {
            if (dom.sidebar.classList.contains('sidebar-collapsed')) return;
            const submenu = button.nextElementSibling;
            const indicator = button.querySelector('.submenu-indicator');
            submenu.classList.toggle('hidden');
            indicator.classList.toggle('rotate-180');
        });
    });
}

function initializeTabs() {
    const tabs = [dom.pdfTab, dom.textTab];
    const panels = [dom.pdfPanel, dom.textPanel];

    const switchTab = (selectedTab) => {
        tabs.forEach(tab => {
            const panel = document.querySelector(tab.dataset.tabsTarget);
            if (tab === selectedTab) {
                tab.setAttribute('aria-selected', 'true');
                tab.classList.add('border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400', 'dark:border-indigo-400');
                tab.classList.remove('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300', 'dark:hover:text-gray-300');
                panel.classList.remove('hidden');
                activeInputMethod = tab.id === 'pdf-tab' ? 'pdf' : 'text';
            } else {
                tab.setAttribute('aria-selected', 'false');
                tab.classList.remove('border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400', 'dark:border-indigo-400');
                tab.classList.add('border-transparent', 'hover:text-gray-600', 'hover:border-gray-300', 'dark:hover:text-gray-300');
                panel.classList.add('hidden');
            }
        });
        updateUI();
    };

    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab)));

    switchTab(dom.pdfTab); // Inicia com a aba de PDF ativa
}

function initializeTableInteractions() {
    dom.resultsHeader.addEventListener('click', (e) => {
        const columnHeader = e.target.closest('span[data-column]');
        if (!columnHeader) return;

        const column = columnHeader.dataset.column;
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'asc';
        }
        createResultsHeader(); // Recria o cabeçalho para atualizar o ícone de ordenação
        applyFiltersAndSort();
    });

    dom.resultsHeader.addEventListener('input', (e) => {
        const filterInput = e.target.closest('input[data-column]');
        if (!filterInput) return;

        clearTimeout(filterDebounceTimer);

        filterDebounceTimer = setTimeout(() => {
            const column = filterInput.dataset.column;
            currentFilters[column] = filterInput.value.trim().toLowerCase();
            applyFiltersAndSort();
        }, 300);
    });
}

// --- INICIALIZAÇÃO GERAL ---
document.addEventListener('DOMContentLoaded', () => {
    // Carrega a base de dados específica desta ferramenta
    loadFixedExcelFile();
    
    setupDragAndDrop(dom.pdfDropArea, dom.pdfFileInput, handlePdfFile);
    dom.cnaeTextInput.addEventListener('input', updateUI);
    dom.removePdfButton.addEventListener('click', removePdfFile);
    dom.processButton.addEventListener('click', handleProcessing);
    dom.downloadButton.addEventListener('click', downloadResults);
    dom.backButton.addEventListener('click', () => toggleView(false));
    
    initializeTheme();
    initializeSidebar();
    initializeTabs();
    initializeTableInteractions();
});