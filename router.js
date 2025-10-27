document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.getElementById('main-content');
    const sidebar = document.getElementById('sidebar');

    // Mapeamento de rotas para arquivos parciais e scripts
    const routes = {
        '/': { partial: 'partials/home.html', script: null, showSidebar: false },
        '/index.html': { partial: 'partials/home.html', script: null, showSidebar: false },
        '/visa.html': { partial: 'partials/visa.html', script: 'script.js', showSidebar: true },
        '/pmf.html': { partial: 'partials/pmf.html', script: 'script-pmf.js', showSidebar: true }
    };

    const loadScript = (scriptSrc, callback) => {
        const oldScript = document.getElementById('tool-script');
        if (oldScript) {
            oldScript.remove();
        }
        if (!scriptSrc) {
            if (callback) callback();
            return;
        }
        const script = document.createElement('script');
        script.id = 'tool-script';
        script.src = scriptSrc;
        script.onload = () => {
            if (callback) callback();
        };
        script.onerror = () => console.error(`Erro ao carregar o script: ${scriptSrc}`);
        document.body.appendChild(script);
    };

    const toggleSidebar = (show) => {
        if (show) {
            sidebar.classList.remove('hidden');
            mainContent.classList.add('ml-64');
        } else {
            sidebar.classList.add('hidden');
            mainContent.classList.remove('ml-64');
        }
    };

    const loadContent = async (path) => {
        const routeConfig = routes[path] || routes['/'];

        // Mostra/esconde a sidebar ANTES de carregar o conteúdo
        toggleSidebar(routeConfig.showSidebar);

        try {
            const response = await fetch(routeConfig.partial);
            if (!response.ok) throw new Error('Página não encontrada');
            const html = await response.text();
            mainContent.innerHTML = html;

            loadScript(routeConfig.script, () => {
                document.dispatchEvent(new CustomEvent('contentLoaded'));
            });

            updateActiveLink(path);

        } catch (error) {
            mainContent.innerHTML = `<div class="text-center p-8"><h1 class="text-2xl font-bold text-red-500">Erro 404</h1><p class="text-gray-500">Página não encontrada.</p></div>`;
            console.error('Erro ao carregar a página:', error);
        }
    };

    const updateActiveLink = (path) => {
        const links = sidebar.querySelectorAll('nav a');
        // Normaliza o path para lidar com a raiz
        const currentPath = (path === '/' || path === '/index.html') ? '/index.html' : path;

        links.forEach(link => {
            const linkHref = link.getAttribute('href');
            const parentLi = link.closest('li');
            const targetEl = parentLi ? parentLi.querySelector('a') : link;

            // Compara o href do link com o path atual
            if (`/${linkHref}` === currentPath || (currentPath === '/index.html' && linkHref === 'index.html')) {
                targetEl.classList.add('bg-gray-700');
                // Abre o submenu se um item dele estiver ativo
                targetEl.closest('ul')?.classList.remove('hidden');
            } else {
                targetEl.classList.remove('bg-gray-700');
            }
        });
    };

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link || link.target === '_blank' || link.href.startsWith('javascript:')) return;

        const path = new URL(link.href).pathname;
        if (routes[path]) {
            e.preventDefault();
            history.pushState({ path }, '', path);
            loadContent(path);
        }
    });

    window.addEventListener('popstate', (e) => {
        const path = e.state ? e.state.path : window.location.pathname;
        loadContent(path);
    });

    const initialPath = window.location.pathname;
    loadContent(initialPath);
});