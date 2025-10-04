// Configuração do worker para pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// --- CONSTANTES E VARIÁVEIS DE ESTADO ---
const CLASSIFICATION_COLORS = { "ALTO risco": "FF0000", "médio risco": "FFFF00" };
const COLUMN_WIDTHS = { "descricao": 85 };

// Mapeamento de colunas para classes de largura do Tailwind CSS
const TABLE_COLUMN_WIDTH_CLASSES = {
    'CNAE': 'w-[150px]',          // Largura fixa de 150px
    'descricao': 'w-auto',        // Largura automática (ocupa o espaço restante)
    'classificacao': 'w-[200px]'  // Largura fixa de 200px
};

// Mapeamento para exibir nomes de colunas personalizados na tela
const COLUMN_DISPLAY_NAMES = {
    'CNAE': 'CNAE',
    'descricao': 'Descrição da Atividade', // <-- Nome alterado aqui
    'classificacao': 'Classificação' // <-- Nome alterado aqui
};
const REGEX_CNAE_FORMATO = /\b\d{2}\.\d{2}-\d-\d{2}\b/g;

let pdfFile = null;
let baseDataFromStorage = null;
let finalResults = [];

// Variáveis de estado para a tabela interativa
let currentSort = { column: null, direction: 'none' };
let currentFilters = {};
let filterDebounceTimer = null;

// --- SELETORES DE ELEMENTOS DO DOM ---
const dom = {
    pdfDropArea: document.getElementById('pdf-drop-area'),
    pdfInitialState: document.getElementById('pdf-initial-state'),
    pdfLoadedState: document.getElementById('pdf-loaded-state'),
    pdfFileName: document.getElementById('pdf-file-name'),
    pdfFileInput: document.getElementById('pdf-file-input'),
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
    const isPdfLoaded = !!pdfFile;
    dom.pdfInitialState.classList.toggle('hidden', isPdfLoaded);
    dom.pdfLoadedState.classList.toggle('hidden', !isPdfLoaded);
    if (isPdfLoaded) {
        dom.pdfFileName.textContent = pdfFile.name;
        dom.pdfFileName.title = pdfFile.name;
    }
    dom.processButton.disabled = !(baseDataFromStorage && pdfFile);
}

/** Cria o cabeçalho da tabela de resultados, incluindo filtros e ordenação. Só deve ser chamado uma vez. */
function createResultsHeader() {
    dom.resultsHeader.innerHTML = '';
    if (finalResults.length === 0) return; // Não cria cabeçalho se não há dados

    const headers = Object.keys(finalResults[0]);
    const interactiveHeaders = ['CNAE', 'descricao', 'classificacao'];

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
        // Usa o mapa de nomes para exibir o nome personalizado. 
        // Se não houver um nome personalizado, usa o nome original formatado.
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
        const classification = row.classificacao?.toLowerCase() || '';
        let rowColorClass = '';
        if (classification.includes("iii - alto")) rowColorClass = 'bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/50';
        else if (classification.includes("ii - médio")) rowColorClass = 'bg-yellow-100 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-800/50';
        tr.className = `border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 ${rowColorClass}`;

        headers.forEach(header => {
            const td = document.createElement('td');
            // Adiciona classes para truncar texto longo na coluna de descrição
            let cellClasses = "p-3 text-sm text-gray-600 dark:text-gray-400 align-top break-words";
            if (header.toLowerCase() === 'cnae') {
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
        const response = await fetch('visa/base de dados.xlsx');
        if (!response.ok) throw new Error(`Não foi possível carregar o arquivo: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
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
    const cnaesEncontrados = new Set();
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        const matches = pageText.match(REGEX_CNAE_FORMATO) || [];
        matches.forEach(cnae => cnaesEncontrados.add(cleanCnae(cnae)));
    }
    return cnaesEncontrados;
}

async function handleProcessing() {
    clearStatus();
    dom.resultsArea.classList.add('hidden');
    dom.processButton.disabled = true;
    
    try {
        logStatus('Validando base de dados...', 'loading');
        const requiredColumns = ['CNAE', 'descricao', 'classificacao'];
        if (!baseDataFromStorage || baseDataFromStorage.length === 0 || !requiredColumns.every(col => col in baseDataFromStorage[0])) {
            throw new Error(`Base de dados inválida ou não carregada. Tente recarregar a página.`);
        }
        logStatus('Base de dados validada.', 'success');
        
        logStatus('Extraindo CNAEs do PDF...', 'loading');
        const pdfCnaes = await readPdfFile(pdfFile);
        logStatus(`${pdfCnaes.size} CNAEs únicos encontrados no PDF.`, 'success');

        logStatus('Comparando arquivos...', 'loading');
        const baseDataWithCleanCnae = baseDataFromStorage.map(row => ({ ...row, NumerosBase: cleanCnae(row.CNAE) }));
        const correspondencias = baseDataWithCleanCnae.filter(row => pdfCnaes.has(row.NumerosBase));
        finalResults = correspondencias.map(({ NumerosBase, ...rest }) => rest);

        clearStatus();
        if (finalResults.length > 0) {
            showToast(`${finalResults.length} correspondências encontradas!`, 'success');
            // Reseta filtros e ordenação, cria o cabeçalho e renderiza o corpo da tabela
            currentFilters = {};
            currentSort = { column: null, direction: 'none' };
            createResultsHeader(); // Cria o cabeçalho interativo uma única vez
            applyFiltersAndSort();
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
        const classification = row.classificacao?.toLowerCase() || '';
        let color = null;
        if (classification.includes("iii - alto")) color = CLASSIFICATION_COLORS["ALTO risco"];
        else if (classification.includes("ii - médio")) color = CLASSIFICATION_COLORS["médio risco"];
        if (color) {
            addedRow.eachCell({ includeEmpty: true }, cell => { 
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; 
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'resultado_validacao.xlsx');
    
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

function initializeTableInteractions() {
    dom.resultsHeader.addEventListener('click', (e) => {
        // Verifica se o clique foi no título da coluna (SPAN) e não no campo de filtro (INPUT)
        const columnHeader = e.target.closest('span[data-column]');
        if (!columnHeader) {
            // Se não foi no título, interrompe a execução para não ordenar
            return;
        }

        const column = columnHeader.dataset.column;
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'asc';
        }
        applyFiltersAndSort();
    });

    dom.resultsHeader.addEventListener('input', (e) => {
        const filterInput = e.target.closest('input[data-column]');
        if (!filterInput) return;

        // Limpa o timer anterior para reiniciar a contagem
        clearTimeout(filterDebounceTimer);

        // Inicia um novo timer. A filtragem só ocorrerá após 300ms sem digitação.
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
    dom.removePdfButton.addEventListener('click', removePdfFile);
    dom.processButton.addEventListener('click', handleProcessing);
    dom.downloadButton.addEventListener('click', downloadResults);
    
    initializeTheme();
    initializeSidebar();
    initializeTableInteractions();
});