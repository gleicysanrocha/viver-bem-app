const CACHE_NAME = 'viver-bem-v8';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './manifest.json',
    './images/icon-192.png',
    './images/icon-512.png'
];

// Instalação: Cacheia os arquivos estáticos
self.addEventListener('install', (event) => {
    // Forçar o worker a esperar a instalação terminar, mas pular a espera para ativar
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Armazenando arquivos em cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Ativação: Limpa caches antigos e toma controle
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(), // Toma controle das abas abertas imediatamente
            caches.keys().then((keyList) => {
                return Promise.all(keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                }));
            })
        ])
    );
});

// Fetch: Serve do cache se offline, ou busca na internet
self.addEventListener('fetch', (event) => {
    // Ignorar requisições do Firebase/Google (não cachear API calls externas)
    if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
