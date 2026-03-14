let playersData = [];
const flagCache = new Map();
const flagsToPreload = new Set();
let countriesData = {};
let lastUpdate = null;
let currentLang = 'en';
let countryFilters = {}; // Armazena o estado dos filtros (true = incluindo, false = ignorando)

// Inicializar idioma
function initLanguage() {
    currentLang = window.i18n.detectLanguage();
    console.log('Idioma detectado:', currentLang);
}

// Atualizar textos da interface
function updateUITexts() {
    document.querySelector('.search-title').textContent = window.i18n.t('searchPlayer', currentLang);
    document.querySelector('.stats-title').textContent = window.i18n.t('statistics', currentLang);
    document.querySelector('.filters-title').textContent = window.i18n.t('filters', currentLang);
    document.getElementById('playerSearch').placeholder = window.i18n.t('searchPlaceholder', currentLang);
    document.getElementById('filterToggle').textContent = window.i18n.t('filterCountries', currentLang);
}

// Carregar dados dos jogadores do arquivo local
async function loadPlayers() {
    try {
        const response = await fetch('usuarios.json');
        const data = await response.json();
        
        // Extrair data de atualização
        lastUpdate = data['last-update'] ? new Date(data['last-update']) : null;
        
        // Extrair todos os jogadores com seus países
        playersData = [];
        countriesData = {};
        
        for (const country in data.countries) {
            if (data.countries[country].players && data.countries[country].abbreviation) {
                const abbreviation = data.countries[country].abbreviation.toLowerCase();
                flagsToPreload.add(abbreviation);
                
                // Armazenar dados do país
                countriesData[country] = {
                    abbreviation: abbreviation,
                    total: data.countries[country].total || data.countries[country].players.length
                };
                
                data.countries[country].players.forEach(player => {
                    playersData.push({
                        name: player,
                        country: abbreviation
                    });
                });
            }
        }
        
        console.log(`${playersData.length} jogadores carregados`);
        
        // Preload das bandeiras
        await preloadFlags();
        
        // Renderizar estatísticas
        renderStats();
        
        // Inicializar filtros
        initializeFilters();
        
        // Atualizar textos da interface
        updateUITexts();
    } catch (error) {
        console.error('Erro ao carregar jogadores:', error);
    }
}

// Calcular tempo desde a última atualização
function getTimeSinceUpdate() {
    if (!lastUpdate) return '';
    
    const now = new Date();
    const diff = now - lastUpdate;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        const unit = days > 1 ? 'timeUnits.days' : 'timeUnits.day';
        return `${days} ${window.i18n.t(unit, currentLang)}`;
    } else if (hours > 0) {
        const unit = hours > 1 ? 'timeUnits.hours' : 'timeUnits.hour';
        return `${hours} ${window.i18n.t(unit, currentLang)}`;
    } else if (minutes > 0) {
        const unit = minutes > 1 ? 'timeUnits.minutes' : 'timeUnits.minute';
        return `${minutes} ${window.i18n.t(unit, currentLang)}`;
    } else {
        const unit = seconds > 1 ? 'timeUnits.seconds' : 'timeUnits.second';
        return `${seconds} ${window.i18n.t(unit, currentLang)}`;
    }
}

// Preload de todas as bandeiras
async function preloadFlags() {
    const promises = Array.from(flagsToPreload).map(async (country) => {
        try {
            const response = await fetch(`flags/${country}.svg`);
            if (response.ok) {
                const svgText = await response.text();
                flagCache.set(country, svgText);
            }
        } catch (error) {
            console.warn(`Erro ao carregar bandeira: ${country}`);
        }
    });
    
    await Promise.all(promises);
    console.log(`${flagCache.size} bandeiras carregadas`);
}

// Renderizar estatísticas
async function renderStats() {
    const statsContent = document.getElementById('statsContent');
    const lastUpdateEl = document.getElementById('lastUpdate');
    
    // Atualizar texto de última atualização
    if (lastUpdate) {
        const timeAgo = getTimeSinceUpdate();
        lastUpdateEl.textContent = `${window.i18n.t('updatedAgo', currentLang)} ${timeAgo}`;
    }
    
    // Carregar bandeira mundial (JPG)
    let worldFlag = '🌍';
    const worldImg = new Image();
    worldImg.src = 'flags/world.jpg';
    worldImg.onload = () => {
        const worldItem = document.querySelector('.stat-item.world .stat-flag');
        if (worldItem) {
            worldItem.innerHTML = '';
            worldItem.appendChild(worldImg);
        }
    };
    
    // Calcular total mundial
    const totalWorld = playersData.length;
    
    // Ordenar países por quantidade (maior para menor)
    const sortedCountries = Object.entries(countriesData)
        .sort((a, b) => b[1].total - a[1].total);
    
    // Criar item mundial
    const worldItem = document.createElement('div');
    worldItem.className = 'stat-item world';
    worldItem.innerHTML = `
        <span class="stat-flag">${worldFlag}</span>
        <span class="stat-country">${window.i18n.t('world', currentLang)}</span>
        <span class="stat-count">${totalWorld.toLocaleString(currentLang === 'pt' ? 'pt-BR' : currentLang)}</span>
        <span class="stat-label">${window.i18n.t('usersIndexed', currentLang)}</span>
    `;
    statsContent.appendChild(worldItem);
    
    // Criar itens dos países
    sortedCountries.forEach(([countryName, countryData]) => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        
        const flag = flagCache.get(countryData.abbreviation);
        const flagHTML = flag 
            ? `<span class="stat-flag">${flag}</span>` 
            : `<span class="stat-flag"></span>`;
        
        item.innerHTML = `
            ${flagHTML}
            <span class="stat-country">${countryName}</span>
            <span class="stat-count">${countryData.total.toLocaleString(currentLang === 'pt' ? 'pt-BR' : currentLang)}</span>
            <span class="stat-label">${window.i18n.t('usersIndexed', currentLang)}</span>
        `;
        
        statsContent.appendChild(item);
    });
}

const searchInput = document.getElementById('playerSearch');
const autocompleteList = document.getElementById('autocomplete');
let currentFocus = -1;

// Função para escapar caracteres especiais de regex
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Função para destacar texto correspondente
function highlightMatch(text, query) {
    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Função para filtrar e exibir sugestões
function showSuggestions(value) {
    autocompleteList.innerHTML = '';
    currentFocus = -1;
    
    if (!value) {
        autocompleteList.classList.remove('show');
        return;
    }
    
    // Filtrar jogadores que correspondem à busca e aplicar filtros de país
    const matches = playersData.filter(player => {
        const matchesSearch = player.name.toLowerCase().includes(value.toLowerCase());
        const countryEnabled = countryFilters[player.country] !== false; // Por padrão, todos estão habilitados
        return matchesSearch && countryEnabled;
    }).slice(0, 50);
    
    if (matches.length === 0) {
        autocompleteList.classList.remove('show');
        return;
    }
    
    // Criar itens da lista para TODOS os resultados
    matches.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        
        // Adicionar bandeira se disponível
        const flag = flagCache.get(player.country);
        if (flag) {
            const flagSpan = document.createElement('span');
            flagSpan.className = 'flag-icon';
            flagSpan.innerHTML = flag;
            div.appendChild(flagSpan);
        }
        
        // Adicionar nome do jogador
        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = highlightMatch(player.name, value);
        div.appendChild(nameSpan);
        
        div.dataset.index = index;
        
        div.addEventListener('click', function() {
            window.open(`https://www.fightcade.com/id/${player.name}`, '_blank');
            autocompleteList.classList.remove('show');
        });
        
        autocompleteList.appendChild(div);
    });
    
    autocompleteList.classList.add('show');
}

// Event listeners
searchInput.addEventListener('input', function() {
    showSuggestions(this.value);
});

searchInput.addEventListener('focus', function() {
    if (this.value) {
        showSuggestions(this.value);
    }
});

searchInput.addEventListener('keydown', function(e) {
    const items = autocompleteList.getElementsByClassName('autocomplete-item');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        currentFocus++;
        addActive(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        currentFocus--;
        addActive(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentFocus > -1 && items[currentFocus]) {
            items[currentFocus].click();
        }
    } else if (e.key === 'Escape') {
        autocompleteList.classList.remove('show');
    }
});

function addActive(items) {
    if (!items || items.length === 0) return;
    
    removeActive(items);
    
    if (currentFocus >= items.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = items.length - 1;
    
    items[currentFocus].classList.add('active');
    items[currentFocus].scrollIntoView({ block: 'nearest' });
}

function removeActive(items) {
    for (let item of items) {
        item.classList.remove('active');
    }
}

// Fechar autocomplete ao clicar fora
document.addEventListener('click', function(e) {
    if (e.target !== searchInput) {
        autocompleteList.classList.remove('show');
    }
});

// Inicializar idioma e carregar jogadores
initLanguage();
loadPlayers();

// Inicializar filtros
function initializeFilters() {
    // Inicializar todos os países como habilitados
    for (const country in countriesData) {
        countryFilters[countriesData[country].abbreviation] = true;
    }
    
    renderFilters();
    setupFilterToggle();
}

// Renderizar painel de filtros
function renderFilters() {
    const filterContent = document.getElementById('filterContent');
    filterContent.innerHTML = '';
    
    // Ordenar países por quantidade (maior para menor)
    const sortedCountries = Object.entries(countriesData)
        .sort((a, b) => b[1].total - a[1].total);
    
    sortedCountries.forEach(([countryName, countryData]) => {
        const item = document.createElement('div');
        item.className = 'filter-item';
        
        const flag = flagCache.get(countryData.abbreviation);
        const flagHTML = flag 
            ? `<span class="filter-flag">${flag}</span>` 
            : `<span class="filter-flag"></span>`;
        
        const isEnabled = countryFilters[countryData.abbreviation] !== false;
        const statusWord = isEnabled 
            ? window.i18n.t('including', currentLang)
            : window.i18n.t('ignoring', currentLang);
        const resultsWord = window.i18n.t('results', currentLang);
        const statusText = `${statusWord} ${countryData.total} ${resultsWord}`;
        
        item.innerHTML = `
            ${flagHTML}
            <span class="filter-country">${countryName}</span>
            <span class="filter-count">${countryData.total}</span>
            <div class="filter-switch" data-country="${countryData.abbreviation}">
                <div class="switch-toggle ${isEnabled ? 'active' : ''}">
                    <div class="switch-slider"></div>
                </div>
                <span class="switch-label">${statusText}</span>
            </div>
        `;
        
        // Adicionar evento de clique no switch
        const switchElement = item.querySelector('.filter-switch');
        switchElement.addEventListener('click', function() {
            toggleCountryFilter(countryData.abbreviation);
        });
        
        filterContent.appendChild(item);
    });
}

// Alternar filtro de país
function toggleCountryFilter(countryCode) {
    countryFilters[countryCode] = !countryFilters[countryCode];
    renderFilters();
    
    // Atualizar resultados da busca se houver texto no campo
    const searchValue = searchInput.value;
    if (searchValue) {
        showSuggestions(searchValue);
    }
}

// Configurar botão de toggle do painel de filtros
function setupFilterToggle() {
    const filterToggle = document.getElementById('filterToggle');
    const filterPanel = document.getElementById('filterPanel');
    
    filterToggle.addEventListener('click', function() {
        filterPanel.classList.toggle('show');
        this.classList.toggle('active');
    });
}
