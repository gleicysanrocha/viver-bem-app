// --- DYNAMIC IMPORTS & FIREBASE CONFIG ---
console.log("Sistema iniciando...");
// Global variables for Firebase functions
let initializeApp, getFirestore, doc, getDoc, setDoc, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, db = null, auth = null;

const firebaseConfig = {
    apiKey: "AIzaSyCf74C299CZej2-UvDesC8iNV9vr77vJqk",
    authDomain: "viver-bem-bfbe8.firebaseapp.com",
    projectId: "viver-bem-bfbe8",
    storageBucket: "viver-bem-bfbe8.firebasestorage.app",
    messagingSenderId: "667806663588",
    appId: "1:667806663588:web:21bbc673b36ba2082eb731"
};

const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

async function initFirebase() {
    if (!isFirebaseConfigured) {
        console.warn("Firebase não configurado. O app rodará apenas em Modo Offline (LocalStorage).");
        return;
    }

    try {
        console.log("Iniciando carregamento do Firebase...");
        const appModule = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const authModule = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

        initializeApp = appModule.initializeApp;
        getFirestore = firestoreModule.getFirestore;
        doc = firestoreModule.doc;
        getDoc = firestoreModule.getDoc;
        setDoc = firestoreModule.setDoc;
        
        getAuth = authModule.getAuth;
        signInWithEmailAndPassword = authModule.signInWithEmailAndPassword;
        createUserWithEmailAndPassword = authModule.createUserWithEmailAndPassword;
        onAuthStateChanged = authModule.onAuthStateChanged;
        signOut = authModule.signOut;

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        console.log("Firebase conectado com sucesso!");

        // Monitorar Auth State
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("Usuário autenticado:", user.email);
                Storage.setSession(user.uid, user.email);
                await Storage.syncFromCloud(user.uid);
                showDashboard();
            } else {
                console.log("Nenhum usuário logado.");
                Storage.logout();
                showAuth();
            }
        });

    } catch (e) {
        console.error("Erro crítico ao carregar Firebase:", e);
        console.warn("O app seguirá em modo LIMITADO.");
    }
}

// Start Initialization
initFirebase();

// --- PWA INSTALLATION LOGIC ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.style.display = 'flex';
});

window.installPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
};

const USERS_KEY = 'viver_bem_users'; // Mantido apenas para compatibilidade legada se necessário
const SESSION_KEY = 'viver_bem_session_uid';
const EMAIL_KEY = 'viver_bem_session_email';

// Helper para sincronizar nuvem (Agora usa UID)
const Cloud = {
    saveUserInfo: async (uid, data) => {
        if (!db) return;
        try {
            await setDoc(doc(db, "users", uid), data);
            console.log("Dados sincronizados com a nuvem.");
        } catch (e) {
            console.error("Erro ao salvar na nuvem:", e);
        }
    },
    loadUserInfo: async (uid) => {
        if (!db) return null;
        try {
            const docRef = doc(db, "users", uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return docSnap.data();
            }
        } catch (e) {
            console.error("Erro ao baixar da nuvem:", e);
        }
        return null;
    }
};

const Storage = {
    // Método especial para sincronizar
    syncFromCloud: async (uid) => {
        if (!isFirebaseConfigured || !uid) return;
        const cloudData = await Cloud.loadUserInfo(uid);
        if (cloudData) {
            // No novo sistema, o Firestore é a fonte da verdade
            localStorage.setItem(`data_${uid}`, JSON.stringify(cloudData));
            console.log("LocalStorage sincronizado.");
            return true;
        }
        return false;
    },

    saveUserLocally: (uid, email, userData = {}) => {
        try {
            const data = { email, ...userData, historico: userData.historico || [], plans: userData.plans || [] };
            localStorage.setItem(`data_${uid}`, JSON.stringify(data));
            
            // Sync to Cloud
            Cloud.saveUserInfo(uid, data);
            return true;
        } catch (e) {
            console.error("Erro ao salvar local:", e);
            return false;
        }
    },

    updateUser: (uid, updates) => {
        try {
            const currentData = JSON.parse(localStorage.getItem(`data_${uid}`)) || {};
            const newData = { ...currentData, ...updates };
            localStorage.setItem(`data_${uid}`, JSON.stringify(newData));

            // Sync to Cloud
            Cloud.saveUserInfo(uid, newData);
            return true;
        } catch (e) {
            console.error("Erro ao atualizar:", e);
            return false;
        }
    },

    // Sessão (UID e Email)
    setSession: (uid, email) => {
        localStorage.setItem(SESSION_KEY, uid);
        localStorage.setItem(EMAIL_KEY, email);
    },
    getSession: () => {
        return {
            uid: localStorage.getItem(SESSION_KEY),
            email: localStorage.getItem(EMAIL_KEY)
        };
    },
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EMAIL_KEY);
    },

    getData: () => {
        const { uid } = Storage.getSession();
        if (!uid) return null;
        const raw = localStorage.getItem(`data_${uid}`);
        return raw ? JSON.parse(raw) : null;
    },
    saveData: (data) => {
        const { uid } = Storage.getSession();
        if (uid) {
            Storage.updateUser(uid, data);
        }
    },

    // --- MANTER APENAS O CLEAR ---
    clearEverything: () => {
        if (confirm('Deseja limpar o cache local deste navegador? Seus dados na nuvem continuarão salvos.')) {
            localStorage.clear();
            location.reload();
        }
    }
};

let myChart = null;
let isLoginMode = true;

window.onload = () => {
    // O onAuthStateChanged no initFirebase cuidará do redirecionamento
    console.log("App carregado.");
};

// --- AUTH LOGIC (Firebase Auth) ---
window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? 'Bem-vindo de volta' : 'Crie sua conta';
    document.getElementById('auth-subtitle').innerText = isLoginMode ? 'Entre para ver sua evolução' : 'Comece sua jornada hoje';
    document.getElementById('btn-auth').innerText = isLoginMode ? 'Entrar' : 'Cadastrar';
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? 'Não tem conta?' : 'Já tem conta?';
};

window.handleAuth = async () => {
    const email = document.getElementById('auth-user').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();

    if (!email || !pass) return alert('Preencha todos os campos');
    if (!auth) return alert('Erro: Firebase não carregou.');

    const btn = document.getElementById('btn-auth');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Aguarde...";

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, pass);
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            // Salva dados iniciais para o novo usuário
            Storage.saveUserLocally(userCredential.user.uid, email, {
                plans: [],
                historico: [],
                data_cadastro: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error("Auth Error:", error);
        let msg = "Erro desconhecido.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            msg = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/email-already-in-use') {
            msg = "Este e-mail já está em uso.";
        } else if (error.code === 'auth/weak-password') {
            msg = "A senha deve ter pelo menos 6 caracteres.";
        } else if (error.code === 'auth/invalid-email') {
            msg = "E-mail inválido.";
        }
        alert(msg);
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

window.handleLogout = async () => {
    if (auth) {
        await signOut(auth);
    }
    Storage.logout();
    location.reload();
};

// --- BACKUP UI HANDLERS ---
window.triggerRestore = () => {
    document.getElementById('backup-file-input').click();
};

window.handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        Storage.importBackup(e.target.result);
    };
    reader.readAsText(file);
};


// --- NAVIGATION ---
window.navigate = (view) => {
    document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));

    if (view === 'dashboard') {
        document.getElementById('view-dashboard').style.display = 'block';
        renderDashboard();
    } else if (view === 'plano-atual') {
        document.getElementById('view-dynamic').style.display = 'block';
        showCurrentPlan();
    } else if (view === 'historico') {
        document.getElementById('view-historico').style.display = 'block';
        renderHistory();
    } else if (view === 'anamnese') {
        document.getElementById('view-anamnese').style.display = 'block';
        resetAnamnese();
    }

    // Sidebar Active State
    const navItem = Array.from(document.querySelectorAll('.nav-item')).find(i => i.getAttribute('onclick')?.includes(`'${view}'`));
    if (navItem) navItem.classList.add('active');

    // Bottom Nav Active State
    const bottomItem = Array.from(document.querySelectorAll('.bottom-nav-item')).find(i => i.getAttribute('onclick')?.includes(`'${view}'`));
    if (bottomItem) bottomItem.classList.add('active');
};

// --- UI VIEWS ---
function showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('sidebar').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
}

function showDashboard() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('sidebar').style.display = 'flex';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('app-container').style.display = 'block';

    const session = Storage.getSession();
    const displayName = session.email ? session.email.split('@')[0] : 'Usuário';
    document.getElementById('user-display-name').innerText = displayName;
    navigate('dashboard');
}

function renderDashboard() {
    const data = Storage.getData();
    const info = document.getElementById('dash-info');

    if (!data || !data.peso) {
        info.innerHTML = '<p>Nenhum plano ativo. <a href="#" onclick="navigate(\'anamnese\')">Crie seu primeiro plano aqui.</a></p>';
        return;
    }

    if (!data.historico || data.historico.length === 0) {
        info.innerHTML = `
            <div style="font-size: 1.1rem; color: var(--text-light);">Bem-vindo! Comece preenchendo seu primeiro plano.</div>
            <div style="margin-top: 1rem; color: var(--primary); font-weight: 800;">Meta: ${data.objetivo_peso || '--'}kg</div>
        `;
        return;
    }

    const lastWeight = data.historico[data.historico.length - 1].weight || data.historico[data.historico.length - 1].peso;
    const imc = lastWeight / ((data.altura / 100) * (data.altura / 100));

    info.innerHTML = `
        <div style="font-size: 1.2rem; font-weight: 700;">Peso Atual: ${lastWeight}kg</div>
        <div style="color: var(--text-light);">IMC: ${imc.toFixed(1)} (${getIMCStatus(imc)})</div>
        <div style="margin-top: 1rem; color: var(--primary); font-weight: 800;">Meta: ${data.objetivo_peso}kg</div>
    `;

    setTimeout(() => {
        renderChart();
        updateAIFeedback();
    }, 100);
}

// Função para visualizar detalhes do plano
window.viewPlanDetails = (index) => {
    const data = Storage.getData();
    if (!data || !data.plans || !data.plans[index]) return;

    const p = data.plans[index];
    const isFullSnapshot = !!p.local_treino; // Se tem local_treino, provavelmente é um snapshot completo

    // Construir conteúdo do modal
    let content = '';

    if (isFullSnapshot) {
        // Snapshot Completo
        content = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: left;">
                <div>
                    <strong style="color:var(--primary);">Dados Físicos</strong><br>
                    Peso Inicial: <strong>${p.peso}kg</strong><br>
                    Meta: <strong>${p.objetivo_peso}kg</strong><br>
                    Altura: ${p.altura}cm<br>
                    Idade: ${p.idade} anos
                </div>
                <div>
                    <strong style="color:var(--primary);">Configurações</strong><br>
                    Local: <span style="text-transform:capitalize">${p.local_treino}</span><br>
                    Tempo: ${p.tempo_treino} min<br>
                    Atividade: Nível ${p.atividade}<br>
                    Início: ${p.data_inicio}
                </div>
            </div>
            
            <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: left;">
                <strong>Restrições / Preferências:</strong><br>
                ${p.alergias ? `⚠️ Alergias: ${p.alergias}<br>` : ''}
                ${p.nao_gosta ? `⛔ Não Gosta: ${p.nao_gosta}` : 'Nenhuma restrição alimentar registrada.'}
            </div>

            <div style="margin-top: 20px; font-size: 0.9rem; color: #7f8c8d;">
                <em>Este plano foi arquivado em ${p.finalizado_em || 'Data desconhecida'}.</em>
            </div>
        `;
    } else {
        // Legado (Resumo Simples)
        content = `
            <div style="text-align: center; padding: 20px;">
                <p>Este é um registro antigo simplificado.</p>
                <div style="font-size: 1.2rem; margin: 20px 0;">
                    <div>Início: <strong>${p.data_inicio}</strong></div>
                    <div>Peso na época: <strong>${p.peso}kg</strong></div>
                    <div>Meta: <strong>${p.objetivo_peso}kg</strong></div>
                </div>
                <small style="color: #95a5a6;">Registros mais recentes conterão detalhes completos do plano.</small>
            </div>
        `;
    }

    // Modal simples injetado dinamicamente
    const modalId = 'modal-historico-details';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'auth-overlay'; // Reusing overlay style
        modal.style.display = 'none';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="card" style="max-width: 500px; width: 90%; position: relative;">
            <button onclick="document.getElementById('${modalId}').style.display='none'" style="position: absolute; right: 20px; top: 20px; background: none; border: none; font-size: 1.2rem; cursor: pointer;">✕</button>
            <h3 style="margin-bottom: 20px; padding-right: 30px;">Detalhes do Plano Arquivado</h3>
            ${content}
            <div style="margin-top: 25px; text-align: right;">
                <button class="btn-primary" onclick="document.getElementById('${modalId}').style.display='none'">Fechar</button>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
};

window.deleteActivePlan = () => {
    if (!confirm('ATENÇÃO: Você está prestes a excluir seu PLANO ATUAL. \n\nIsso limpará suas configurações ativas, mas manterá seu histórico de planos anteriores. \n\nDeseja continuar e voltar para a tela inicial?')) return;

    const data = Storage.getData();
    if (!data) return;

    // Preservar histórico e sessão
    const savedHistory = data.plans || [];
    const userSession = Storage.getSession(); // Preservar nome do usuário

    // Zerar dados ativos
    const newData = {
        user_session: userSession, // Manter user
        plans: savedHistory,      // Manter histórico
        // Dados fundamentais zerados para forçar 'resetAnamnese'
        peso: null,
        objetivo_peso: null,
        altura: null
    };

    Storage.saveData(newData);
    alert('Plano atual excluído com sucesso.');
    location.reload(); // Recarregar para limpar estados globais e voltar ao início
};

window.deletePlan = (index) => {
    if (!confirm('Tem certeza que deseja excluir este registro do histórico permanentemente?')) return;
    const data = Storage.getData();
    if (data && data.plans) {
        data.plans.splice(index, 1);
        Storage.saveData(data); // Using saveData handles persistence
        renderHistory();
    }
};

// Função para Gerar Relatório Completo (Dossiê)
window.printPlanReport = (planData, isCurrent = false) => {
    // Determinar dados base
    const p = planData;
    if (!p) return;

    const statusColor = isCurrent ? '#27ae60' : '#7f8c8d';
    const statusText = isCurrent ? 'EM ANDAMENTO' : `CONCLUÍDO EM ${p.finalizado_em || 'DATA DESCONHECIDA'}`;

    // Calcular Calorias Base (Harris-Benedict simplificado para relatório)
    const tmb = (10 * p.peso) + (6.25 * p.altura) - (5 * p.idade) + (p.sexo === 'masculino' ? 5 : -161);
    const gcd = Math.round(tmb * (parseFloat(p.atividade) || 1.2));
    const kcalMeta = gcd - 500; // Déficit padrão

    // Obter Dados Gerados (Nutri e Treino)
    const menus = window.getAdaptedMenus ? window.getAdaptedMenus(kcalMeta, p) : null;
    const treinoData = window.getTreinoData ? window.getTreinoData(p) : null;

    // Gerar HTML de Nutrição
    let htmlNutri = '';
    if (menus) {
        htmlNutri = `
            <div style="margin-bottom: 40px; page-break-inside: avoid;">
                <h3 style="color: #2c3e50; font-size: 20px; border-bottom: 2px solid #2ecc71; padding-bottom: 10px; margin-bottom: 20px;">🍎 Plano Nutricional (${kcalMeta} kcal)</h3>
                
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #27ae60; margin-bottom: 10px;">Opção 1: Tradicional (Equilibrada)</h4>
                    <ul style="list-style: none; padding: 0;">
                        ${menus.tradicional.map(m => `
                            <li style="margin-bottom: 8px; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                                <strong style="color: #34495e;">${m.r}:</strong> ${m.c.replace(/<[^>]*>/g, '')}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div style="margin-bottom: 20px;">
                    <h4 style="color: #2980b9; margin-bottom: 10px;">Opção 2: Alta Proteína (Saciedade)</h4>
                    <ul style="list-style: none; padding: 0;">
                        ${menus.proteico.map(m => `
                            <li style="margin-bottom: 8px; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                                <strong style="color: #34495e;">${m.r}:</strong> ${m.c.replace(/<[^>]*>/g, '')}
                            </li>
                        `).join('')}
                    </ul>
                </div>
                 <div style="margin-bottom: 20px;">
                    <h4 style="color: #e67e22; margin-bottom: 10px;">Opção 3: Low Carb (Metabólica)</h4>
                    <ul style="list-style: none; padding: 0;">
                        ${menus.lowcarb.map(m => `
                            <li style="margin-bottom: 8px; font-size: 14px; border-bottom: 1px dashed #eee; padding-bottom: 5px;">
                                <strong style="color: #34495e;">${m.r}:</strong> ${m.c.replace(/<[^>]*>/g, '')}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `;
    }

    // Gerar HTML de Treino
    let htmlTreino = '';
    if (treinoData && treinoData.rotina) {
        htmlTreino = `
            <div style="margin-bottom: 40px; page-break-inside: avoid;">
                <h3 style="color: #2c3e50; font-size: 20px; border-bottom: 2px solid #8e44ad; padding-bottom: 10px; margin-bottom: 20px;">💪 Treino Periodizado: ${treinoData.rotina.length} Divisões</h3>
                <p style="font-size: 14px; color: #7f8c8d; margin-bottom: 15px;">
                    Duração média: ${treinoData.tempo} min | Foco: ${treinoData.sBonus > 0 ? "Volume / Resistência" : "Intensidade / Hipertrofia"}
                </p>
                
                ${treinoData.rotina.map(treino => `
                    <div style="margin-bottom: 30px; page-break-inside: avoid;">
                        <h4 style="background: #9b59b6; color: white; padding: 8px 12px; border-radius: 4px; display: inline-block; margin: 0 0 10px 0;">
                            ${treino.nome} - ${treino.foco}
                        </h4>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <thead>
                                <tr style="background: #f4f6f7;">
                                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Exercício</th>
                                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Séries</th>
                                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Reps</th>
                                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Descanso</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${treino.exer.map(t => `
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #ddd;">${t.ex}</td>
                                        <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${t.s}</td>
                                        <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${t.r}</td>
                                        <td style="padding: 8px; text-align: center; border: 1px solid #ddd;">${t.d}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Gerar HTML do Relatório
    const htmlContent = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
            <div style="border-bottom: 2px solid ${statusColor}; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h1 style="margin: 0; color: #2c3e50; font-size: 28px;">Dossiê do Plano ${p.foco || 'Personalizado'}</h1>
                    <div style="margin-top: 10px; display: inline-block; background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold;">${statusText.toUpperCase()}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 14px; color: #95a5a6;">Meta do Plano</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${statusColor};">
                        ${p.objetivo_peso} kg
                    </div>
                </div>
            </div>

            <!-- Grid de Dados Principais -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 40px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                    <h3 style="margin: 0 0 15px 0; color: #34495e; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Dados Físicos (Inicial)</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 14px;">
                        <div><strong>Peso Inicial:</strong> ${p.peso || '--'} kg</div>
                        <div><strong>Altura:</strong> ${p.altura || '--'} cm</div>
                        <div><strong>Idade:</strong> ${p.idade || '--'} anos</div>
                        <div><strong>Sexo:</strong> ${p.sexo || '--'}</div>
                    </div>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                    <h3 style="margin: 0 0 15px 0; color: #34495e; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Configurações</h3>
                    <div style="font-size: 14px; line-height: 1.6;">
                        <div><strong>Início:</strong> ${p.data_inicio}</div>
                        <div><strong>Local de Treino:</strong> <span style="text-transform:capitalize">${p.local_treino || 'Academia'}</span></div>
                        <div><strong>Tempo Diário:</strong> ${p.tempo_treino || 45} min</div>
                        <div><strong>Nível Atividade:</strong> ${p.atividade}</div>
                    </div>
                </div>
            </div>
            
            <!-- Inserção Dinâmica de Nutri e Treino -->
            ${htmlNutri}
            ${htmlTreino}

            <!-- Restrições -->
            <div style="margin-bottom: 40px; page-break-inside: avoid;">
                <h3 style="color: #2c3e50; font-size: 18px; margin-bottom: 15px;">Restrições & Preferências</h3>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0;">
                    <tr>
                        <td style="padding: 12px; background: #fffbe6; font-weight: bold; width: 150px; border-bottom: 1px solid #e2e8f0;">Alergias</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${p.alergias || 'Nenhuma registrada'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; background: #fff1f0; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Não Gosta</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${p.nao_gosta || 'Nenhuma restrição registrada'}</td>
                    </tr>
                </table>
            </div>

            <div style="margin-top: 50px; text-align: center; border-top: 1px solid #eee; padding-top: 20px; color: #bdc3c7; font-size: 12px;">
                Gerado por Viver Bem PRO - Dossiê Completo
            </div>
        </div>
    `;

    // Print Overlay
    const printContainer = document.createElement('div');
    printContainer.className = 'print-section-overlay';
    printContainer.style.background = 'white';
    printContainer.innerHTML = htmlContent;
    document.body.appendChild(printContainer);

    // Style
    if (!document.querySelector('#print-report-style')) {
        const style = document.createElement('style');
        style.id = 'print-report-style';
        style.innerHTML = `
            @media print {
                @page { margin: 1cm; size: A4; }
                body * { visibility: hidden; }
                .print-section-overlay, .print-section-overlay * { visibility: visible; }
                .print-section-overlay { position: absolute; left: 0; top: 0; width: 100%; min-height: 100vh; background: white; z-index: 99999; }
                /* Otimizar quebras de página */
                h1, h2, h3, h4 { break-after: avoid; }
                table, ul, .plan-item { break-inside: avoid; }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        window.print();
        setTimeout(() => {
            if (document.body.contains(printContainer)) {
                // document.body.removeChild(printContainer); // Manter para debug se necessário, ou remover. Remover é melhor UX.
                document.body.removeChild(printContainer);
            }
        }, 500);
    }, 500);
};

function renderHistory() {
    const data = Storage.getData();
    const list = document.getElementById('plan-history-list');
    list.innerHTML = '';

    // 1. Mostrar Plano ATUAL (Active) no topo
    if (data && data.peso) { // Se tem peso, tem plano ativo
        const activeItem = document.createElement('div');
        activeItem.className = 'plan-history-item';
        // Destaque visual para o plano ativo
        activeItem.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 1.2rem; background: #f0fff4; border: 2px solid #2ecc71; border-radius: var(--radius-md); margin-bottom: 2rem; box-shadow: 0 4px 6px rgba(46, 204, 113, 0.1);";

        activeItem.innerHTML = `
            <div>
                <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 5px;">
                    <strong style="color: #27ae60; font-size: 1.1rem;">PLANO ATUAL (EM ANDAMENTO)</strong>
                    <span class="badge" style="background:#2ecc71; color:white;">ATIVO</span>
                </div>
                <div style="color: var(--secondary);">Meta: <strong>${data.objetivo_peso}kg</strong> • Início: ${data.data_inicio}</div>
            </div>
            <div style="display:flex; gap: 8px;">
                 <button class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="navigate('plano-atual')">Abrir Painel</button>
                 <button class="btn-outline" style="padding: 0.5rem 0.8rem; font-size: 0.8rem;" onclick="printPlanReport(Storage.getData(), true)">🖨️</button>
                 <button class="btn-outline" style="padding: 0.5rem 0.8rem; font-size: 0.8rem; border-color: #e74c3c; color: #e74c3c;" onclick="deleteActivePlan()" title="Excluir Plano Atual">🗑️</button>
            </div>
        `;
        list.appendChild(activeItem);
    } else {
        // Se não tem plano ativo
        const emptyActive = document.createElement('div');
        emptyActive.innerHTML = '<p style="text-align:center; padding: 1rem; color: #95a5a6; border: 1px dashed #ccc; border-radius: 8px; margin-bottom: 2rem;">Nenhum plano ativo no momento.</p>';
        list.appendChild(emptyActive);
    }

    // Header para Histórico
    if (data && data.plans && data.plans.length > 0) {
        const historyHeader = document.createElement('h3');
        historyHeader.innerText = "Arquivo Morto (Concluídos)";
        historyHeader.style.cssText = "font-size: 1.2rem; color: var(--secondary); margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem;";
        list.appendChild(historyHeader);

        // Iterar reverso para mostrar mais recentes no topo
        for (let i = data.plans.length - 1; i >= 0; i--) {
            const p = data.plans[i];
            const item = document.createElement('div');
            item.className = 'plan-history-item';
            item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 10px; transition: transform 0.2s;";
            item.onmouseover = () => item.style.transform = "translateX(5px)";
            item.onmouseout = () => item.style.transform = "translateX(0)";

            item.innerHTML = `
                <div>
                    <strong style="color: var(--secondary);">Plano ${p.foco || 'Personalizado'}</strong><br>
                    <small style="color: var(--text-muted); display: block; margin-top: 4px;">🏁 Concluído em: ${p.finalizado_em || 'Data desconhecida'}</small>
                    <small style="color: #95a5a6;">Início: ${p.data_inicio} • Meta Original: ${p.objetivo_peso}kg</small>
                </div>
                <div style="display:flex; gap: 8px;">
                    <button class="btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="viewPlanDetails(${i})">👁️ Ver</button>
                    <button class="btn-outline" style="padding: 0.4rem 1rem; font-size: 0.75rem;" onclick="printPlanReport(Storage.getData().plans[${i}])" title="Imprimir Dossiê">🖨️</button>
                    <button class="btn-outline" style="padding: 0.4rem 0.6rem; font-size: 0.75rem; border-color: #e74c3c; color: #e74c3c;" onclick="deletePlan(${i})" title="Excluir Plano">🗑️</button>
                </div>
            `;
            list.appendChild(item);
        }
    } else {
        const emptyHistory = document.createElement('p');
        emptyHistory.style.cssText = "text-align: center; color: var(--text-light); margin-top: 2rem;";
        emptyHistory.innerText = "Nenhum plano antigo no histórico.";
        list.appendChild(emptyHistory);
    }
}

function showCurrentPlan() {
    const data = Storage.getData();
    if (!data || !data.peso) return navigate('anamnese');

    // Garantir que o container de resultados esteja visível
    const resultsEl = document.getElementById('results');
    if (resultsEl) resultsEl.style.display = 'block';

    // Injetar dados nas abas de resultados existentes
    exibirResultados(data);
}

// --- REUSED LOGIC FROM V4 ---
function exibirResultados(data) {
    if (!data) return;
    const peso = parseFloat(data.peso) || 0;
    const altura = (parseFloat(data.altura) || 160) / 100;
    const idade = parseInt(data.idade) || 30;
    const atividade = parseFloat(data.atividade) || 1.2;
    const ritmo = parseFloat(data.ritmo) || 1.0;
    const sexo = data.sexo || 'masculino';

    const imc = peso > 0 ? (peso / (altura * altura)) : 0;
    const imcStatus = getIMCStatus(imc);

    // Harris-Benedict (Gasto Energético Basal)
    let tmb = sexo === 'masculino'
        ? 66 + (13.7 * peso) + (5 * (altura * 100)) - (6.8 * idade)
        : 655 + (9.6 * peso) + (1.8 * (altura * 100)) - (4.7 * idade);

    const get = tmb * atividade;
    const metaCalorica = Math.max(get - (ritmo * 700), 1200);

    // Atualizar UI
    const metaEl = document.getElementById('meta-diaria-display');
    if (metaEl) metaEl.innerText = `${Math.round(metaCalorica)} kcal / dia`;

    // Calcular Datas do Plano
    let dataInicioStr = data.data_inicio || new Date().toISOString().split('T')[0];
    let startData = new Date(dataInicioStr + 'T00:00:00');
    if (isNaN(startData.getTime())) startData = new Date();
    
    let duracaoSemanas = parseInt(data.duracao) || 12;
    let endData = new Date(startData);
    endData.setDate(endData.getDate() + (duracaoSemanas * 7));
    
    let strInicio = startData.toLocaleDateString('pt-BR');
    let strFim = endData.toLocaleDateString('pt-BR');

    const gridEl = document.getElementById('resumo-grid-content');
    if (gridEl) {
        gridEl.innerHTML = `
            <div class="plan-item" style="border-color: #3498db; background: var(--surface);">
                <h3>Seu Status</h3>
                <div style="font-size: 1.5rem; font-weight: 800; margin-top:0.5rem;">IMC: ${imc.toFixed(1)}</div>
                <p>${imcStatus}</p>
            </div>
            <div class="plan-item" style="border-color: #e67e22; background: var(--surface);">
                <h3>Meta Calórica</h3>
                <div style="font-size: 1.5rem; font-weight: 800; margin-top:0.5rem;">${Math.round(metaCalorica)} kcal</div>
                <p>Foco: Perda de Gordura</p>
            </div>
            <div class="plan-item" style="border-color: #2ecc71; background: var(--surface);">
                <h3>Local de Treino</h3>
                <div style="font-size: 1.5rem; font-weight: 800; margin-top:0.5rem; text-transform: capitalize;">${data.local_treino || 'Academia'}</div>
                <p>${data.equipamentos && data.equipamentos.length > 0 ? 'Com equipamentos' : 'Peso do corpo'}</p>
            </div>
            <div class="plan-item" style="border-color: #9b59b6; background: var(--surface);">
                <h3>Período do Plano</h3>
                <div style="font-size: 1.2rem; font-weight: 800; margin-top:0.5rem; color: var(--primary);">${strInicio} - ${strFim}</div>
                <p>Duração: ${duracaoSemanas} semanas</p>
            </div>
        `;
    }

    // Resetar abas e renderizar conteúdo detalhado
    if (typeof switchTab === 'function') switchTab('resumo');
    if (typeof switchSubTab === 'function') switchSubTab('tradicional');

    renderNutri(metaCalorica, data);
    renderTreino(data);
    renderCronograma(data, peso, ritmo);
}

function getIMCStatus(imc) {
    return imc < 18.5 ? "Abaixo do peso" : imc < 25 ? "Peso normal" : imc < 30 ? "Sobrepeso" : "Obesidade";
}

// --- ANAMNESE FORM LOGIC ---
// Flag global para controle de edição
let isEditingMode = false;

function resetAnamnese(editData = null) {
    const container = document.getElementById('view-anamnese-content');
    if (!container) return;

    isEditingMode = !!editData;

    container.innerHTML = `
        <div class="card" style="max-width: 800px; margin: 0 auto; animation: fadeIn 0.5s ease-out;">
            <div style="text-align: center; margin-bottom: 2.5rem;">
                <h2 style="font-size: 1.8rem; color: var(--secondary);">${isEditingMode ? '✨ Refinar Seu Plano' : '🎯 Iniciar Nova Jornada'}</h2>
                <p style="color: var(--text-muted);">${isEditingMode ? 'Ajuste seus dados para que a IA recalcule suas metas.' : 'Conte-nos sobre você para gerarmos seu cronograma ideal.'}</p>
            </div>

            <form id="anamnese-form-ultimate">
                <div class="grid" style="margin-top: 0;">
                    <div class="form-group">
                        <label>Idade</label>
                        <input type="number" id="idade-u" required placeholder="Anos" value="${editData ? editData.idade : ''}">
                    </div>
                    <div class="form-group">
                        <label>Sexo Biológico</label>
                        <select id="sexo-u">
                            <option value="masculino" ${editData && editData.sexo === 'masculino' ? 'selected' : ''}>Masculino</option>
                            <option value="feminino" ${editData && editData.sexo === 'feminino' ? 'selected' : ''}>Feminino</option>
                        </select>
                    </div>
                </div>
                
                <div class="grid">
                    <div class="form-group">
                        <label>Peso Atual (kg)</label>
                        <input type="number" id="peso-u" step="0.1" required placeholder="Ex: 85.0" value="${editData ? editData.peso : ''}">
                    </div>
                    <div class="form-group">
                        <label>Altura (cm)</label>
                        <input type="number" id="altura-u" required placeholder="Ex: 175" value="${editData ? editData.altura : ''}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Nível de Atividade</label>
                    <select id="atividade-u">
                        <option value="1.2" ${editData && editData.atividade === '1.2' ? 'selected' : ''}>Sedentário (Pouco ou nenhum exercício)</option>
                        <option value="1.375" ${editData && editData.atividade === '1.375' ? 'selected' : ''}>Leve (Ex: Caminhada 1-3x/sem)</option>
                        <option value="1.55" ${editData && editData.atividade === '1.55' ? 'selected' : ''}>Moderado (Treino 3-5x/sem)</option>
                        <option value="1.725" ${editData && editData.atividade === '1.725' ? 'selected' : ''}>Intenso (Treino 6-7x/sem)</option>
                    </select>
                </div>

                <div class="grid">
                    <div class="form-group">
                        <label>Local de Treino Principal</label>
                        <select id="local-u" onchange="toggleEquipamentos(this.value)">
                            <option value="academia" ${editData && editData.local_treino === 'academia' ? 'selected' : ''}>Academia</option>
                            <option value="casa" ${editData && editData.local_treino === 'casa' ? 'selected' : ''}>Em Casa</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Objetivo de Peso (kg)</label>
                        <input type="number" id="meta-u" step="0.1" required placeholder="Ex: 70.0" value="${editData ? editData.objetivo_peso : ''}">
                    </div>
                </div>

                <div class="grid">
                    <div class="form-group">
                        <label>📅 Data de Início</label>
                        <input type="date" id="data-u" value="${editData ? editData.data_inicio.split('/').reverse().join('-') : new Date().toISOString().split('T')[0]}" ${isEditingMode ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label>⏱️ Duração do Projeto</label>
                        <select id="duracao-u">
                            <option value="4" ${editData && editData.duracao == 4 ? 'selected' : ''}>4 Semanas (Foco Total)</option>
                            <option value="8" ${editData && editData.duracao == 8 ? 'selected' : ''}>8 Semanas (Intermediário)</option>
                            <option value="12" ${editData && (editData.duracao == 12 || !editData.duracao) ? 'selected' : ''}>12 Semanas (Ideal/Padrão)</option>
                            <option value="24" ${editData && editData.duracao == 24 ? 'selected' : ''}>24 Semanas (Longo Prazo/Estilo de Vida)</option>
                        </select>
                    </div>
                </div>
                
                <div class="grid">
                    <div class="form-group">
                        <label>Tempo Disponível para Treino (minutos/dia)</label>
                        <select id="tempo-u">
                            <option value="30" ${editData && editData.tempo_treino == 30 ? 'selected' : ''}>30 minutos (Rápido)</option>
                            <option value="45" ${editData && (!editData.tempo_treino || editData.tempo_treino == 45) ? 'selected' : ''}>45 minutos (Médio)</option>
                            <option value="60" ${editData && editData.tempo_treino == 60 ? 'selected' : ''}>60 minutos (Ideal)</option>
                            <option value="90" ${editData && editData.tempo_treino == 90 ? 'selected' : ''}>90+ minutos (Intenso)</option>
                        </select>
                    </div>
                </div>

                <div id="equipamentos-container" style="display: none; margin-bottom: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.02); border-radius: 12px;">
                    <label style="margin-bottom: 1rem;">Equipamentos Disponíveis em Casa:</label>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                        <label class="checklist-item"><input type="checkbox" value="halteres" class="equip-check"> Halteres</label>
                        <label class="checklist-item"><input type="checkbox" value="elasticos" class="equip-check"> Elásticos</label>
                        <label class="checklist-item"><input type="checkbox" value="esteira" class="equip-check"> Esteira/Bike</label>
                         <label class="checklist-item"><input type="checkbox" value="tapete" class="equip-check"> Tapete</label>
                         <label class="checklist-item"><input type="checkbox" value="prancha_multi" class="equip-check"> Prancha Multifuncional 9em1</label>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label>Possui alguma Alergia Alimentar ou Intolerância?</label>
                    <textarea id="alergias-u" placeholder="Ex: Intolerância a lactose, alergia a amendoim... (ou deixe em branco)" rows="2">${editData ? editData.alergias || '' : ''}</textarea>
                </div>

                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label>Alimentos que você NÃO gosta (para evitar):</label>
                    <textarea id="nao-gosta-u" placeholder="Ex: Peixe, Brócolis, Café... (ou deixe em branco)" rows="2">${editData ? editData.nao_gosta || '' : ''}</textarea>
                </div>

                <button type="submit" class="btn-primary" style="width: 100%; margin-top: 1rem;">${isEditingMode ? 'Salvar Alterações' : 'Gerar Plano IA Personal Alpha'}</button>
                ${isEditingMode ? '<button type="button" class="btn-outline" style="width: 100%; margin-top: 0.5rem;" onclick="showCurrentPlan()">Cancelar</button>' : ''}
            </form>
        </div>
    `;

    // Restaurar equipamentos se estiver editando
    setTimeout(() => {
        const local = document.getElementById('local-u').value;
        toggleEquipamentos(local);
        if (editData && editData.equipamentos) {
            editData.equipamentos.forEach(eq => {
                const el = document.querySelector(`.equip-check[value="${eq}"]`);
                if (el) el.checked = true;
            });
        }
    }, 100);

    document.getElementById('anamnese-form-ultimate').addEventListener('submit', (e) => {
        e.preventDefault();

        const oldData = Storage.getData();

        const pesoAtual = parseFloat(document.getElementById('peso-u').value);
        const alturaAtual = parseFloat(document.getElementById('altura-u').value);
        const idadeAtual = parseInt(document.getElementById('idade-u').value);
        const objetivoPeso = parseFloat(document.getElementById('meta-u').value);
        const alergias = document.getElementById('alergias-u').value.trim();
        const naoGosta = document.getElementById('nao-gosta-u').value.trim();

        const equips = Array.from(document.querySelectorAll('.equip-check:checked')).map(cb => cb.value);

        let newData;

        if (isEditingMode && oldData) {
            newData = {
                ...oldData,
                idade: idadeAtual,
                sexo: document.getElementById('sexo-u').value,
                peso: pesoAtual,
                altura: alturaAtual,
                atividade: document.getElementById('atividade-u').value,
                objetivo_peso: objetivoPeso,
                local_treino: document.getElementById('local-u').value,
                tempo_treino: parseInt(document.getElementById('tempo-u').value) || 45,
                duracao: parseInt(document.getElementById('duracao-u').value) || 12,
                alergias: alergias,
                nao_gosta: naoGosta,
                equipamentos: equips
            };
        } else {
            // Criar um resumo do plano antigo ANTES de atualizar para o histórico
            let previousPlans = oldData && oldData.plans ? [...oldData.plans] : [];

            // Só arquiva se HOUVER um plano anterior válido (com peso definido)
            if (oldData && oldData.peso) {
                let snapshot = { ...oldData };
                delete snapshot.plans;
                delete snapshot.weekly_tracking;
                snapshot.finalizado_em = new Date().toLocaleDateString('pt-BR');
                previousPlans.push(snapshot);
            }

            newData = {
                idade: idadeAtual,
                sexo: document.getElementById('sexo-u').value,
                peso: pesoAtual,
                altura: alturaAtual,
                atividade: document.getElementById('atividade-u').value,
                objetivo_peso: objetivoPeso,
                data_inicio: document.getElementById('data-u').value,
                local_treino: document.getElementById('local-u').value,
                tempo_treino: parseInt(document.getElementById('tempo-u').value) || 45,
                duracao: parseInt(document.getElementById('duracao-u').value) || 12,
                alergias: alergias,
                nao_gosta: naoGosta,
                equipamentos: equips,
                ritmo: 1.0,
                historico: [{ data: new Date().toLocaleDateString('pt-BR'), peso: pesoAtual }],
                plans: previousPlans,
                weekly_tracking: []
            };
        }

        if (Storage.saveData(newData) !== false) {
            setTimeout(() => navigate('plano-atual'), 100);
        }
    });
}

// Helper functions (Nutri, Treino, Cronograma, Chart) identical to v4 but with safe checks
function renderNutri(kcal, data) {
    const alergiasRaw = data && data.alergias ? data.alergias.toLowerCase() : "";
    const naoGostaRaw = data && data.nao_gosta ? data.nao_gosta.toLowerCase() : "";

    // Detecção de restrições
    const isLactose = alergiasRaw.includes('lactose') || alergiasRaw.includes('leite');
    const isGluten = alergiasRaw.includes('gluten') || alergiasRaw.includes('glúten') || alergiasRaw.includes('pão') || alergiasRaw.includes('trigo');
    const isVegan = alergiasRaw.includes('carne') || alergiasRaw.includes('ovo') || alergiasRaw.includes('frango') || alergiasRaw.includes('peixe') || alergiasRaw.includes('vegan');

    // Inserir alerta de alergias e botão de imprimir
    const nutriHead = document.querySelector('#nutricao');
    if (nutriHead) {
        // Garantir botão de impressão
        if (!document.getElementById('btn-print-nutri')) {
            const printBtn = document.createElement('button');
            printBtn.id = 'btn-print-nutri';
            printBtn.className = 'btn-outline';
            printBtn.style = "float: right; font-size: 0.8rem; padding: 5px 10px;";
            printBtn.innerHTML = "🖨️ Imprimir Cardápio";
            printBtn.onclick = () => printSection('nutricao');
            nutriHead.querySelector('h3').appendChild(printBtn);
        }

        const existingAlert = document.getElementById('alerta-alergias');
        if (existingAlert) existingAlert.remove();

        let alertsHtml = "";

        if (alergiasRaw) {
            let statusAdap = [];
            if (isLactose) statusAdap.push("Zero Lactose");
            if (isGluten) statusAdap.push("Sem Glúten");
            if (isVegan) statusAdap.push("Base Vegetal");

            const adaptacaoTexto = statusAdap.length > 0 ? `Adaptado para: <strong>${statusAdap.join(', ')}</strong>` : "Considere suas restrições.";
            alertsHtml += `<div style="background: #fff3cd; color: #856404; padding: 1rem; border-radius: 12px; margin-bottom: 1rem; border-left: 5px solid #ffeeba; font-size: 0.9rem;"><strong>⚠️ Restrições:</strong> ${alergiasRaw}. ${adaptacaoTexto}</div>`;
        }

        if (naoGostaRaw) {
            alertsHtml += `<div style="background: #e2e3e5; color: #383d41; padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border-left: 5px solid #d6d8db; font-size: 0.9rem;"><strong>⛔ Evitando:</strong> ${naoGostaRaw}. Os itens foram removidos ou substituídos.</div>`;
        }

        if (alertsHtml) {
            const alertContainer = document.createElement('div');
            alertContainer.id = 'alerta-alergias';
            alertContainer.innerHTML = alertsHtml;
            const h3 = nutriHead.querySelector('h3');
            h3.parentNode.insertBefore(alertContainer, h3.nextSibling);
        }
    }

    // Aplicar adaptações
    const menus = getAdaptedMenus(kcal, data);

    // Print Helpers Robustos e Definitivos
    // Print Helpers Robustos e Definitivos
    window.printSection = (id) => {
        const el = document.getElementById(id);
        if (!el) {
            console.error('Elemento não encontrado:', id);
            return alert('Erro: Seção de impressão não encontrada.');
        }

        // Criar um container temporário para impressão
        const printContainer = document.createElement('div');
        printContainer.className = 'print-section';
        printContainer.innerHTML = el.innerHTML;

        // FORÇAR VISIBILIDADE: Importante para imprimir a tabela oculta
        printContainer.style.display = 'block';
        printContainer.style.visibility = 'visible';

        // Preservar valores de inputs
        const originalInputs = el.querySelectorAll('input, select, textarea');
        const newInputs = printContainer.querySelectorAll('input, select, textarea');
        originalInputs.forEach((input, i) => {
            if (newInputs[i]) {
                newInputs[i].value = input.value;
                if (input.type === 'checkbox' || input.type === 'radio') {
                    newInputs[i].checked = input.checked;
                }
            }
        });

        document.body.appendChild(printContainer);

        // Pequeno delay para garantir renderização antes do print
        setTimeout(() => {
            window.print();
            // Limpar após impressão
            setTimeout(() => {
                if (document.body.contains(printContainer)) {
                    document.body.removeChild(printContainer);
                }
            }, 500);
        }, 200);
    };

    // Garantir que a função de editar esteja global e acessível
    window.editCurrentPlan = () => {
        const data = Storage.getData();
        if (!data || !data.peso) return alert('Nenhum plano ativo para editar.');
        window.scrollTo(0, 0);
        resetAnamnese(data);
    };

    const renderNutriSection = (id, tipo) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = menus[tipo].map(m => `
                <div class="plan-item" style="margin-bottom: 0.8rem; display: flex; flex-direction: column;">
                    <strong style="color: var(--primary); font-size: 0.8rem; text-transform: uppercase;">${m.r}</strong>
                    <span style="color: var(--text); font-weight: 600;">${m.c}</span>
                </div>
            `).join('');
        }
    };

    renderNutriSection('nutri-tradicional', 'tradicional');
    renderNutriSection('nutri-lowcarb', 'lowcarb');
    renderNutriSection('nutri-proteico', 'proteico');
}

function renderTreino(data) {
    const treinoContainer = document.getElementById('treino-container');
    if (!treinoContainer) return;

    // Obter dados do treino puros
    const { tempo, rotina, sBonus } = getTreinoData(data);

    treinoContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
             <h3 style="margin:0;">Seu Cronograma de Treinos</h3>
             <button class="btn-outline" style="font-size: 0.8rem; padding: 5px 10px;" onclick="printSection('treino-container')">🖨️ Imprimir Tudo</button>
        </div>
        <div class="plan-item" style="margin-bottom: 1.5rem; border-left-color: #9b59b6;">
            <strong>ℹ️ Estrutura do Treino:</strong> Você tem <strong>${rotina.length} divisões de treino</strong>. 
            ${rotina.length > 2 ? "Intercale os treinos (A, B, C...) durante a semana." : "Alterne entre os treinos A e B."}
            <br><small>Tempo médio: ${tempo} min | Foco: ${sBonus > 0 ? "Metabólico/Volume" : "Força/Hipertrofia"}</small>
        </div>
        
        ${rotina.map(treino => `
            <div style="margin-bottom: 2rem;">
                <h4 style="color: var(--primary); border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    ${treino.nome} <span style="font-weight:normal; color:var(--text-light); font-size:0.9rem;">— ${treino.foco}</span>
                </h4>
                <table class="pro-table">
                    <thead>
                        <tr><th>Exercício</th><th>Séries</th><th>Reps / Tempo</th><th>Descanso</th></tr>
                    </thead>
                    <tbody>
                        ${treino.exer.map(t => {
        const searchUrl = `https://www.youtube.com/results?search_query=como+fazer+${t.ex.replace(/\s+/g, '+')}`;
        return `
                            <tr>
                                <td style="display: flex; align-items: center; gap: 8px;">
                                    ${t.ex} 
                                    <a href="${searchUrl}" target="_blank" style="text-decoration: none; opacity: 0.7;" title="Ver vídeo do exercício">▶️</a>
                                </td>
                                <td>${t.s}</td>
                                <td>${t.r}</td>
                                <td>${t.d}</td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        `).join('')}
    `;
}

// ----------------------
// NEW HELPER FUNCTIONS
// ----------------------

window.getAdaptedMenus = (kcal, data) => {
    // 1. Definição de Auxiliares
    const q = (base) => {
        const factor = kcal / 2000;
        return Math.round(base * factor);
    };
    const CB = (text) => `<span style="color: green; font-weight: bold;" title="Ótimo Custo-Benefício">💲</span> ${text}`;

    // 2. Extração de Flags
    const alergiasRaw = data && data.alergias ? data.alergias.toLowerCase() : "";
    const naoGostaRaw = data && data.nao_gosta ? data.nao_gosta.toLowerCase() : "";

    const isLactose = alergiasRaw.includes('lactose') || alergiasRaw.includes('leite');
    const isGluten = alergiasRaw.includes('gluten') || alergiasRaw.includes('glúten') || alergiasRaw.includes('pão') || alergiasRaw.includes('trigo');
    const isVegan = alergiasRaw.includes('carne') || alergiasRaw.includes('ovo') || alergiasRaw.includes('frango') || alergiasRaw.includes('peixe') || alergiasRaw.includes('vegan');

    // 3. Cardápios Base (Foco: Natural & Custo-Benefício)
    let menus = {
        tradicional: [
            { r: "Café da Manhã", c: `${CB("2 fatias de Pão")} (forma ou francês) + ${q(30)}g Queijo Minas/Ricota + ${CB("1 Ovo cozido")} + Café preto` },
            { r: "Almoço", c: `${CB(q(100) + "g Arroz")} + ${CB(q(80) + "g Feijão")} + ${CB(q(120) + "g Frango grelhado/cozido")} + Salada (Alface/Tomate)` },
            { r: "Lanche", c: `1 Fruta da Estação (Banana/Maçã) + ${CB(q(20) + "g Aveia")} + Iogurte Natural (ou 1 Ovo)` },
            { r: "Jantar", c: `${CB("Omelete de " + Math.max(2, q(2)) + " ovos")} com cenoura/abobrinha ralada + Salada de folhas` }
        ],
        lowcarb: [
            { r: "Café da Manhã", c: `${CB(Math.max(2, q(2)) + " Ovos mexidos")} + Café s/ açúcar + 1 Ft. Queijo Minas` },
            { r: "Almoço", c: `Carne Moída/Frango (${q(150)}g) + ${CB("Legumes da estação refogados")} (Abobrinha/Repolho) + Azeite` },
            { r: "Lanche", c: `1 Ovo cozido + ${CB("Coco seco")} ou Amendoim (${q(20)}g)` },
            { r: "Jantar", c: `${CB(q(150) + "g Frango desfiado")} + Salada de Repolho com Tomate` }
        ],
        proteico: [
            { r: "Café da Manhã", c: `3 Ovos cozidos/mexidos + 1 Banana` },
            { r: "Almoço", c: `${CB(q(150) + "g Frango/Fígado")} + ${CB(q(100) + "g Batata doce/Mandioca")} + Vegetais` },
            { r: "Lanche", c: `${CB("Sardinha em lata")} (custo-benefício) ou Frango desfiado + 1 fatia de Pão` },
            { r: "Jantar", c: `Moela/Frango/Carne Magra (${q(150)}g) + Salada verde` }
        ]
    };

    // 4. Lógica de Substituição
    const adaptarMenu = (menu) => {
        return menu.map(item => {
            let desc = item.c;

            if (isLactose) {
                // Tenta substituir frases completas primeiro para evitar sobras
                desc = desc.replace(/Queijo Minas\/Ricota|Queijo Branco|Queijo prato|1 Ft. Queijo Minas|Queijo/gi, "Requeijão LacFree (1 colher) ou Ovo extra");
                desc = desc.replace(/Iogurte Natural/gi, "1 Fruta extra");
                desc = desc.replace(/Café com leite/gi, "Café preto");
            }

            if (isGluten) {
                desc = desc.replace(/Pão integral|torradas integrais|torradas/gi, "Tapioca ou Batata Doce");
                desc = desc.replace(/Aveia/gi, "Flocos de Milho");
            }

            if (isVegan) {
                desc = desc.replace(/Frango grelhado|Frango desfiado|Frango|Peito de Frango/gi, "PTS (Soja) refogada");
                desc = desc.replace(/Carne Bovina|Carne Moída|Carne|Patinho/gi, "Grão de Bico ou Lentilha");
                desc = desc.replace(/Peixe assado|Peixe|Tilápia|Salmão|Atum em lata|Atum/gi, "Feijão Branco");
                desc = desc.replace(/Ovo cozido|Ovos cozidos|Ovos mexidos|Ovos|Omelete/gi, "PTS ou Feijão");
                desc = desc.replace(/Queijo .*/gi, "Azeite de Oliva");
                desc = desc.replace(/Whey Protein/gi, "Proteína de Soja (Isolada)");
            }

            if (naoGostaRaw) {
                const dislikes = naoGostaRaw.split(',').map(s => s.trim().toLowerCase());
                dislikes.forEach(badFood => {
                    if (!badFood) return;
                    const regex = new RegExp(badFood + "[a-z]*", 'gi');
                    // Correção Ovos
                    if (desc.toLowerCase().match(regex) || (badFood.includes('ovo') && desc.toLowerCase().includes('ovo'))) {
                        let substituto = "Opção equivalente";
                        if (badFood.includes('ovo')) substituto = "Frango desfiado";
                        else if (badFood.includes('frango')) substituto = "Carne Moída ou Ovos";
                        else if (badFood.includes('carne')) substituto = "Frango ou Ovos";
                        else if (badFood.includes('peixe') || badFood.includes('atum')) substituto = "Frango grelhado";
                        else if (badFood.includes('salada') || badFood.includes('verdura')) substituto = "Legumes cozidos (Cenoura/Vagem)";
                        else if (badFood.includes('café')) substituto = "Chá ou Suco Zero";
                        else if (badFood.includes('banana')) substituto = "Maçã ou Laranja";
                        else substituto = "Alimento Substituto (Equivalente)";

                        if (badFood.includes('ovo')) {
                            desc = desc.replace(/(\d+\s+)?(Ovo|Ovos) (cozido|mexido|mexidos|cozidos)/gi, substituto);
                            desc = desc.replace(/Omelete de \d+ ovos/gi, substituto);
                            desc = desc.replace(/Omelete/gi, substituto);
                            desc = desc.replace(/(Ovo|Ovos)/gi, substituto);
                        } else {
                            desc = desc.replace(regex, substituto);
                        }
                    }
                });
            }
            return { r: item.r, c: desc };
        });
    };

    return {
        tradicional: adaptarMenu(menus.tradicional),
        lowcarb: adaptarMenu(menus.lowcarb),
        proteico: adaptarMenu(menus.proteico)
    };
};


window.getTreinoData = (data) => {
    const equipamentos = data.equipamentos || [];
    const tempo = data.tempo_treino || 45;
    // Nivelatividade: 1.2 (Sedentário), 1.375 (Leve), 1.55 (Moderado), 1.725 (Intenso)
    const nivel = parseFloat(data.atividade);

    // Ajuste de Volume
    const sBonus = tempo > 50 ? 1 : 0;
    const rBonus = tempo > 50 ? 0 : 0;

    const rotina = []; // Array de { nome: "Treino A", foco: "...", exer: [] }

    // Helpers de Equipamento
    const hasHalteres = equipamentos.includes('halteres');
    const hasElastico = equipamentos.includes('elasticos');
    const hasPranchaMulti = equipamentos.includes('prancha_multi');
    const isCasa = data.local_treino === 'casa';

    // *** DEFINIÇÃO DOS EXERCÍCIOS DISPONÍVEIS ***
    // (Seleciona o melhor exercício baseado no equipamento disponível)

    // EMPURRAR (Peito/Ombro/Tríceps)
    const exFlexao = hasPranchaMulti ? "Flexão na Prancha Multi (Cor Azul/Vermelha)" : "Flexão de Braço (Variável)";
    const exSupino = hasHalteres ? "Supino Reto c/ Halteres" : hasElastico ? "Supino em Pé c/ Elástico" : "Flexão de Braço (Pés elevados)";
    const exOmbro = hasHalteres ? "Desenvolvimento c/ Halteres" : hasElastico ? "Desenvolvimento c/ Elástico" : "Pike Pushups (Ombro)";
    const exLateral = hasHalteres ? "Elevação Lateral" : hasElastico ? "Elevação Lateral c/ Elástico" : "Elevação Lateral (Isometria/Garrafas)";
    const exTriceps = hasHalteres ? "Tríceps Francês" : hasElastico ? "Tríceps Corda (Elástico)" : "Mergulho no Banco/Cadeira";

    // PUXAR (Costas/Bíceps)
    const exRemada = hasHalteres ? "Remada Curvada" : hasElastico ? "Remada Baixa c/ Elástico" : "Remada na Porta (Toalha)";
    const exPuxada = hasHalteres ? "Crucifixo Inverso" : hasElastico ? "Puxada Alta c/ Elástico" : "Pull-up ou Superman (Solo)";
    const exBiceps = hasHalteres ? "Rosca Direta" : hasElastico ? "Rosca Direta c/ Elástico" : "Rosca Bíceps (Isometria/Toalha)";
    const exMartelo = hasHalteres ? "Rosca Martelo" : hasElastico ? "Rosca Martelo c/ Elástico" : "Flexão de Braço (Fechada)";

    // PERNAS
    const exAgacha = hasHalteres ? "Agachamento Goblet" : "Agachamento Livre";
    const exAfundo = hasHalteres ? "Afundo c/ Halteres" : "Afundo (Peso do corpo)";
    const exStiff = hasHalteres ? "Stiff c/ Halteres" : hasElastico ? "Good Morning c/ Elástico" : "Elevação Pélvica (Unilateral se fácil)";
    const exPanturrilha = "Panturrilha em Pé (Unilateral)";

    // CORE
    const exAbdominal = hasPranchaMulti ? "Prancha Dinâmica (Multi)" : "Abdominal Supra curto";
    const exInfra = "Abdominal Infra (Elevação de pernas)";
    const exPlank = "Prancha Isométrica";

    // --- MONTAGEM DOS TREINOS ---

    if (nivel <= 1.375) {
        // INICIANTE / LEVE -> TREINO AB (Upper / Lower + Core)
        // Mais adequado para quem treina 2-3x na semana

        // TREINO A (Superior + Abs)
        const treinoA = [];
        treinoA.push({ ex: "Aquecimento: Polichinelos", s: "2", r: "45s", d: "-" });
        if (isCasa) {
            treinoA.push({ ex: exFlexao, s: `${3}`, r: "10-12", d: "60s" });
            treinoA.push({ ex: exRemada, s: `${3}`, r: "12-15", d: "60s" });
            treinoA.push({ ex: exOmbro, s: "3", r: "12", d: "45s" });
            treinoA.push({ ex: exBiceps, s: "3", r: "12-15", d: "45s" });
            treinoA.push({ ex: exTriceps, s: "3", r: "12-15", d: "45s" });
            treinoA.push({ ex: exAbdominal, s: "3", r: "15-20", d: "40s" });
        } else { // Academia
            treinoA.push({ ex: "Supino Máquina ou Halter", s: "3", r: "12", d: "60s" });
            treinoA.push({ ex: "Puxada Alta (Pulley)", s: "3", r: "12", d: "60s" });
            treinoA.push({ ex: "Desenvolvimento Máquina", s: "3", r: "12", d: "60s" });
            treinoA.push({ ex: "Rosca Direta Polia/Halter", s: "3", r: "12", d: "45s" });
            treinoA.push({ ex: "Tríceps Pulley", s: "3", r: "12", d: "45s" });
        }
        rotina.push({ nome: "Treino A", foco: "Membros Superiores & Core", exer: treinoA });

        // TREINO B (Inferior + Cardio)
        const treinoB = [];
        treinoB.push({ ex: "Aquecimento: Agachamento s/ peso", s: "2", r: "15", d: "-" });
        if (isCasa) {
            treinoB.push({ ex: exAgacha, s: "4", r: "12-15", d: "60s" });
            treinoB.push({ ex: exAfundo, s: "3", r: "12", d: "60s" });
            treinoB.push({ ex: exStiff, s: "3", r: "15", d: "60s" });
            treinoB.push({ ex: exPanturrilha, s: "3", r: "20", d: "45s" });
            treinoB.push({ ex: exPlank, s: "3", r: "30-45s", d: "45s" });
        } else { // Academia
            treinoB.push({ ex: "Leg Press 45º", s: "4", r: "12", d: "90s" });
            treinoB.push({ ex: "Cadeira Extensora", s: "3", r: "15", d: "60s" });
            treinoB.push({ ex: "Mesa Flexora", s: "3", r: "12", d: "60s" });
            treinoB.push({ ex: "Panturrilha Sentado/Pé", s: "3", r: "15", d: "45s" });
        }
        rotina.push({ nome: "Treino B", foco: "Membros Inferiores & Cardio", exer: treinoB });

    } else {
        // MODERADO / INTENSO -> TREINO ABC (Push / Pull / Legs)
        // Ideal para quem treina 3-6x na semana

        // TREINO A (EMPURRAR - Peito, Ombro, Tríceps)
        const treinoA = [];
        if (isCasa) {
            treinoA.push({ ex: "Aquecimento Articular", s: "1", r: "2 min", d: "-" });
            treinoA.push({ ex: exFlexao, s: `${3 + sBonus}`, r: "10-15", d: "60s" });
            treinoA.push({ ex: exSupino, s: "3", r: "12", d: "60s" });
            treinoA.push({ ex: exOmbro, s: "3", r: "12-15", d: "60s" });
            treinoA.push({ ex: exLateral, s: "3", r: "15", d: "45s" });
            treinoA.push({ ex: exTriceps, s: `${3 + sBonus}`, r: "12-15", d: "45s" });
            treinoA.push({ ex: exAbdominal, s: "4", r: "20", d: "45s" });
        } else {
            treinoA.push({ ex: "Supino Reto (Halter/Barra)", s: "4", r: "10-12", d: "90s" });
            treinoA.push({ ex: "Supino Inclinado (Halter)", s: "3", r: "12", d: "60s" });
            treinoA.push({ ex: "Desenvolvimento Militar", s: "3", r: "10-12", d: "60s" });
            treinoA.push({ ex: "Elevação Lateral", s: "3 or 4", r: "12-15", d: "45s" });
            treinoA.push({ ex: "Tríceps Corda", s: "3", r: "15", d: "45s" });
        }
        rotina.push({ nome: "Treino A", foco: "Empurrar - Peito, Ombro, Tríceps", exer: treinoA });

        // TREINO B (PUXAR - Costas, Bíceps, Trapézio)
        const treinoB = [];
        if (isCasa) {
            treinoB.push({ ex: "Aquecimento: Polichinelos", s: "1", r: "1 min", d: "-" });
            treinoB.push({ ex: exRemada, s: `${3 + sBonus}`, r: "12-15", d: "60s" });
            treinoB.push({ ex: exPuxada, s: "3", r: "12-15", d: "60s" });
            treinoB.push({ ex: "Crucifixo Inverso (Improviso)", s: "3", r: "15", d: "45s" });
            treinoB.push({ ex: exBiceps, s: `${3 + sBonus}`, r: "12", d: "45s" });
            treinoB.push({ ex: exMartelo, s: "3", r: "12", d: "45s" });
            treinoB.push({ ex: exPlank, s: "3", r: "45-60s", d: "60s" });
        } else {
            treinoB.push({ ex: "Puxada Alta (Externa)", s: "4", r: "10-12", d: "90s" });
            treinoB.push({ ex: "Remada Baixa (Triângulo)", s: "3", r: "12", d: "60s" });
            treinoB.push({ ex: "Serrote (Unilateral)", s: "3", r: "12", d: "60s" });
            treinoB.push({ ex: "Rosca Direta (Barra W)", s: "3", r: "10-12", d: "60s" });
            treinoB.push({ ex: "Rosca Martelo", s: "3", r: "12", d: "45s" });
        }
        rotina.push({ nome: "Treino B", foco: "Puxar - Costas e Bíceps", exer: treinoB });

        // TREINO C (PERNAS COMPLETO)
        const treinoC = [];
        if (isCasa) {
            treinoC.push({ ex: "Aquecimento: 2 min skipping", s: "-", r: "-", d: "-" });
            treinoC.push({ ex: exAgacha, s: "4", r: "15", d: "60s" });
            treinoC.push({ ex: "Agachamento Sumô", s: "3", r: "15", d: "60s" });
            treinoC.push({ ex: exAfundo, s: "3", r: "12 cada", d: "60s" });
            treinoC.push({ ex: exStiff, s: "4", r: "12-15", d: "60s" });
            treinoC.push({ ex: exPanturrilha, s: "4", r: "20", d: "45s" });
        } else {
            treinoC.push({ ex: "Agachamento Livre/Smith", s: "4", r: "10-12", d: "90s" });
            treinoC.push({ ex: "Leg Press 45º", s: "4", r: "12", d: "90s" });
            treinoC.push({ ex: "Cadeira Extensora", s: "3", r: "15 (drop na última)", d: "60s" });
            treinoC.push({ ex: "Mesa Flexora", s: "4", r: "12", d: "60s" });
            treinoC.push({ ex: "Panturrilhas no Leg", s: "4", r: "15-20", d: "45s" });
        }
        rotina.push({ nome: "Treino C", foco: "Membros Inferiores Completos", exer: treinoC });
    }

    return { tempo, rotina, sBonus };
};

// Global View State
let cronogramaViewMode = 'mensal';

window.setCronogramaView = (mode) => {
    cronogramaViewMode = mode;

    // Update active button state
    document.querySelectorAll('.cron-view-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--primary)';
    });

    const activeBtn = document.getElementById(`btn-view-${mode}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = 'var(--primary)';
        activeBtn.style.color = 'white';
    }

    // Trigger re-render
    const data = Storage.getData();
    if (data) renderCronograma(data, parseFloat(data.peso), parseFloat(data.ritmo));
};

function renderCronograma(data, peso, ritmo) {
    const projBody = document.getElementById('projecao-body');
    if (!projBody) return;

    // Inject View Toggle if not exists
    const container = document.getElementById('tabela-projecao-container');
    if (container && !document.getElementById('cronograma-view-toggle')) {
        const toggleDiv = document.createElement('div');
        toggleDiv.id = 'cronograma-view-toggle';
        toggleDiv.style = "display: flex; justify-content: center; gap: 10px; margin-bottom: 1.5rem;";
        toggleDiv.innerHTML = `
            <button id="btn-view-mensal" class="btn-outline cron-view-btn active" style="background:var(--primary); color:white;" onclick="setCronogramaView('mensal')">📅 Visão Mensal</button>
            <button id="btn-view-semanal" class="btn-outline cron-view-btn" onclick="setCronogramaView('semanal')">📆 Visão Semanal</button>
        `;
        container.parentNode.insertBefore(toggleDiv, container);
    }

    const startData = new Date(data.data_inicio + 'T00:00:00');
    if (isNaN(startData.getTime())) {
        // Fallback for date if invalid
        startData.setTime(Date.now());
    }

    const pesoAlvo = parseFloat(data.objetivo_peso);
    const totalPerder = peso - pesoAlvo;

    let dataFinalEstimada = startData;

    let htmlProj = '';

    if (cronogramaViewMode === 'mensal') {
        // Gerar evolução mensal linear (Mês 1, Mês 2, etc.)
        for (let i = 0; i <= 24; i++) { // Mostrar até 24 meses
            const dataMes = new Date(startData);
            dataMes.setMonth(startData.getMonth() + i);

            // Ritmo mensal aproximado = ritmo (quinzenal?) * 2
            const perdaEstimada = i * (ritmo * 2);

            const pesoPrevisto = Math.max(peso - perdaEstimada, pesoAlvo);
            const porcentagem = totalPerder > 0 ? (((peso - pesoPrevisto) / totalPerder) * 100).toFixed(0) : 100;
            const isMeta = pesoPrevisto <= pesoAlvo;

            htmlProj += `
                <tr style="${isMeta ? 'background: #f0fff4;' : ''}">
                    <td>${i === 0 ? 'Início' : i + 'º Mês'}</td>
                    <td>${dataMes.toLocaleDateString('pt-BR')}</td>
                    <td><strong>${pesoPrevisto.toFixed(1)} kg</strong> ${isMeta ? '🏆' : ''}</td>
                    <td><span class="badge" style="background:rgba(52, 152, 219, 0.1); color:#3498db;">${Math.min(porcentagem, 100)}%</span></td>
                </tr>
            `;

            if (isMeta) {
                dataFinalEstimada = dataMes;
                break; // Para quando atingir a meta
            }
        }

    } else {
        // Semanal Mode - Project next 12 weeks
        for (let i = 0; i <= 52; i++) { // Estender para até 1 ano de semanas
            const dataSemana = new Date(startData);
            dataSemana.setDate(startData.getDate() + (i * 7));

            const perdaEstimada = i * (ritmo / 2);
            const pesoPrevisto = Math.max(peso - perdaEstimada, pesoAlvo);
            const porcentagem = totalPerder > 0 ? (((peso - pesoPrevisto) / totalPerder) * 100).toFixed(0) : 100;
            const isMeta = pesoPrevisto <= pesoAlvo;

            htmlProj += `
                <tr style="${isMeta ? 'background: #f0fff4;' : ''}">
                    <td>${i === 0 ? 'Início' : i + 'ª Semana'}</td>
                    <td>${dataSemana.toLocaleDateString('pt-BR')}</td>
                    <td><strong>${pesoPrevisto.toFixed(0)}.${pesoPrevisto.toFixed(1).split('.')[1]} kg</strong> ${isMeta ? '🏆' : ''}</td>
                    <td><span class="badge" style="background:rgba(52, 152, 219, 0.1); color:#3498db;">${Math.min(porcentagem, 100)}%</span></td>
                </tr>
            `;

            if (isMeta) {
                dataFinalEstimada = dataSemana;
                break;
            }
        }
    }

    // Atualizar Header com as Datas
    const metaPerderEl = document.getElementById('total-peso-perder');
    if (metaPerderEl) {
        metaPerderEl.innerHTML = `
            <div>Meta: <strong>-${totalPerder.toFixed(1)} kg</strong></div>
            <div style="font-size: 0.8rem; margin-top:4px; opacity:0.9;">
                📅 Início: ${startData.toLocaleDateString('pt-BR')} <br>
                🏁 Previsão: ${dataFinalEstimada.toLocaleDateString('pt-BR')}
            </div>
        `;
    }

    projBody.innerHTML = htmlProj;

    const checkSemanl = document.getElementById('check-semanal');
    if (checkSemanl) {
        checkSemanl.innerHTML = `
            <div class="checklist-item"><input type="checkbox"> Pesar-se em jejum na segunda-feira</div>
            <div class="checklist-item"><input type="checkbox"> Beber ${Math.round(peso * 35)}ml de água todos os dias</div>
            <div class="checklist-item"><input type="checkbox"> Completar pelo menos 3 treinos na semana</div>
            <div class="checklist-item"><input type="checkbox"> Dormir entre 7h e 8h por noite</div>
            <div class="checklist-item"><input type="checkbox"> Seguir a dieta em pelo menos 80% das refeições</div>
        `;
    }

    // Planilha de Acompanhamento Semanal
    const acompanhamentoEl = document.getElementById('cronograma');
    if (acompanhamentoEl) {
        // Header e Botões de Impressão na área de Cronograma (Inserir no início se não houver)
        if (!document.getElementById('cronograma-actions')) {
            const actions = document.createElement('div');
            actions.id = 'cronograma-actions';
            actions.style = "display: flex; gap: 10px; margin-bottom: 1rem; justify-content: flex-end;";
            actions.innerHTML = `
                <button class="btn-outline" style="font-size: 0.8rem; padding: 5px 10px;" onclick="printWeeklyTracking()">🖨️ Relatório de Evolução</button>
                <button class="btn-outline" style="font-size: 0.8rem; padding: 5px 10px;" onclick="printBlankTable()">📄 Tabela em Branco (Manual)</button>
            `;
            acompanhamentoEl.insertBefore(actions, acompanhamentoEl.firstChild);
        }

        let trackingSection = document.getElementById('weekly-tracking-section');
        if (!trackingSection) {
            trackingSection = document.createElement('div');
            trackingSection.id = 'weekly-tracking-section';
            trackingSection.className = 'plan-item';
            trackingSection.style.marginTop = '1.5rem';
            trackingSection.style.borderColor = 'var(--accent)';
            trackingSection.innerHTML = `
                <h4 style="margin-bottom: 1rem;">📅 Planilha de Evolução Semanal</h4>
                
                <div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px; align-items: end; margin-bottom: 1rem; background: #f8f9fa; padding: 1rem; border-radius: 8px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label style="font-size: 0.75rem;">Semana (Data)</label>
                        <input type="date" id="track-date" style="padding: 0.5rem;" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label style="font-size: 0.75rem;">Peso Início (kg)</label>
                        <input type="number" id="track-start" step="0.1" style="padding: 0.5rem;" placeholder="Ex: 85.0">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label style="font-size: 0.75rem;">Peso Fim (kg)</label>
                        <input type="number" id="track-end" step="0.1" style="padding: 0.5rem;" placeholder="Ex: 84.5">
                    </div>
                    <button class="btn-primary" style="padding: 0.6rem 1rem;" onclick="addWeeklyEntry()">➕ Adicionar</button>
                </div>

                <div style="overflow-x: auto;">
                    <table class="pro-table" id="tracking-table">
                        <thead>
                            <tr>
                                <th>Data/Semana</th>
                                <th>Peso Início</th>
                                <th>Peso Final</th>
                                <th>Resultado</th>
                                <th>Ação</th>
                            </tr>
                        </thead>
                        <tbody id="tracking-body">
                            <tr><td colspan="5" style="text-align:center; color:#95a5a6;">Nenhum registro semanal ainda.</td></tr>
                        </tbody>
                    </table>
                </div>
            `;
            acompanhamentoEl.appendChild(trackingSection);
        }
        renderTrackingTable(data);
    }
}

window.addWeeklyEntry = () => {
    const date = document.getElementById('track-date').value;
    const start = parseFloat(document.getElementById('track-start').value);
    const end = parseFloat(document.getElementById('track-end').value);

    if (!date || isNaN(start) || isNaN(end)) {
        return alert('Preencha a data e os dois pesos corretamente.');
    }

    const username = Storage.getSession();
    const data = Storage.getData();
    if (!data.weekly_tracking) data.weekly_tracking = [];

    data.weekly_tracking.push({ date, start, end });
    // Ordenar por data decrescente
    data.weekly_tracking.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Feature de Sincronização
    // Se o peso final desta semana for diferente do peso atual do usuário, oferecer update
    if (Math.abs(end - data.peso) > 0.1) {
        if (confirm(`Parabéns pelo registro! \n\nVocê finalizou a semana com ${end}kg. \nDeseja atualizar seu PESO ATUAL (que está ${data.peso}kg) para este novo valor? \n\nIsso atualizará seus cálculos de dieta e treino.`)) {
            data.peso = end;
            // Também adiciona ao histórico geral para o gráfico
            const hojeData = new Date().toLocaleDateString('pt-BR');
            if (!data.historico) data.historico = [];
            data.historico.push({ data: hojeData, peso: end });
            alert("Peso principal atualizado com sucesso!");
        }
    }

    Storage.updateUser(username, {
        weekly_tracking: data.weekly_tracking,
        peso: data.peso,
        historico: data.historico
    });

    renderTrackingTable(data); // Re-render com dados atualizados
    renderDashboard(); // Atualiza dashboard caso peso tenha mudado

    // Limpar inputs de peso
    document.getElementById('track-start').value = '';
    document.getElementById('track-end').value = '';
};

window.deleteWeeklyEntry = (index) => {
    if (!confirm('Remover este registro?')) return;
    const username = Storage.getSession();
    const data = Storage.getData();
    if (data.weekly_tracking) {
        data.weekly_tracking.splice(index, 1);
        Storage.updateUser(username, { weekly_tracking: data.weekly_tracking });
        renderTrackingTable(data);
    }
};

function renderTrackingTable(data) {
    const tbody = document.getElementById('tracking-body');
    if (!tbody) return;

    if (!data.weekly_tracking || data.weekly_tracking.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#95a5a6;">Nenhum registro. Adicione sua primeira semana acima!</td></tr>';
        return;
    }

    tbody.innerHTML = data.weekly_tracking.map((entry, index) => {
        const diff = entry.end - entry.start;
        const diffFormatted = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
        const color = diff <= 0 ? '#2ecc71' : '#e74c3c'; // Verde se perdeu ou manteve, vermelho se ganhou

        // Data formatada
        const dateParts = entry.date.split('-');
        const dateStr = `${dateParts[2]}/${dateParts[1]}`;

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${entry.start} kg</td>
                <td>${entry.end} kg</td>
                <td style="color: ${color}; font-weight: bold;">${diffFormatted} kg</td>
                <td><button onclick="deleteWeeklyEntry(${index})" style="background:none; border:none; cursor:pointer;">🗑️</button></td>
            </tr>
        `;
    }).join('');
}


function renderChart() {
    const ctx = document.getElementById('evolutionChart');
    if (!ctx) return; // Ensure the canvas element exists
    const data = Storage.getData();
    if (!data || !data.historico) return;

    const labels = data.historico.map(h => h.data);
    const pesos = data.historico.map(h => h.peso);

    // Projeção ideal
    const ritmo = parseFloat(data.ritmo);
    const pesoInicial = parseFloat(data.peso);
    const projecao = labels.map((_, i) => pesoInicial - (i * ritmo));

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Peso Real (kg)',
                    data: pesos,
                    borderColor: '#2ecc71',
                    tension: 0.1,
                    fill: false
                },
                {
                    label: 'Projeção Meta (kg)',
                    data: projecao,
                    borderColor: '#3498db',
                    borderDash: [5, 5],
                    tension: 0.1,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: false }
            }
        }
    });
}

function updateAIFeedback() {
    const data = Storage.getData();
    const feedbackEl = document.getElementById('personal-alpha-message');
    if (!feedbackEl) return;

    if (!data || !data.historico || data.historico.length < 1) {
        feedbackEl.innerText = "Olá! Comece registrando seu peso para que eu possa analisar sua evolução.";
        return;
    }

    const historico = data.historico;
    const last = historico[historico.length - 1];
    const objetivo = parseFloat(data.objetivo_peso);
    const pesoInicial = historico[0].peso;

    let dicaLocal = "";
    if (data.local_treino === 'casa') {
        dicaLocal = data.equipamentos.length > 0
            ? "Use seus equipamentos para aumentar a intensidade!"
            : "Use o peso do seu corpo, mas foque na execução lenta dos movimentos.";
    } else {
        dicaLocal = "Na academia, foque em progressão de carga toda semana.";
    }

    if (historico.length < 2) {
        feedbackEl.innerText = `Plano ativo! Sua meta é chegar aos ${objetivo}kg. ${dicaLocal} Beba bastante água hoje!`;
        return;
    }

    const prev = historico[historico.length - 2];
    const diff = last.peso - prev.peso;
    const totalDiff = last.peso - pesoInicial;

    let text = "";
    if (diff < -0.5) {
        text = `Excelente! Você perdeu ${Math.abs(diff).toFixed(1)}kg desde o último registro. Continue assim! ${dicaLocal}`;
    } else if (diff <= 0) {
        text = `Peso estável ou leve descida. Tente aumentar 15min de caminhada diária para acelerar a queima. ${dicaLocal}`;
    } else {
        text = `Houve um leve aumento. Não desanime! Foque na dieta regular esta semana e reduza o sal. ${dicaLocal}`;
    }

    feedbackEl.innerHTML = text; // Alterado para innerHTML para suportar links/botões

    // Lógica de Upgrade / Platô
    if (diff > -0.1 && diff < 0.2 && historico.length > 3) {
        // Se após 3 registros o peso não mudar muito
        feedbackEl.innerHTML += `<br><br><strong style="color: var(--accent);">⚠️ Alerta de Platô:</strong> Seu peso estabilizou? <a href="#" onclick="navigate('anamnese')" style="color: var(--primary);">Clique aqui para fazer um UPGRADE no seu plano</a> e recalcular suas metas!`;
    } else if (last.peso <= objetivo + 1) {
        feedbackEl.innerHTML += `<br><br><strong style="color: #2ecc71;">🏆 Reta Final!</strong> Você está muito perto da meta. <button onclick="window.print()" style="padding: 2px 8px; font-size: 0.8rem; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">🖨️ Gerar Relatório</button>`;
    }
}

// Additional functions from v4 that are still needed but not directly called by the new routing
window.printBlankTable = () => {
    const data = Storage.getData();
    const dataInicio = data ? new Date(data.data_inicio).toLocaleDateString('pt-BR') : '___/___/___';
    const meta = data ? data.objetivo_peso : '___';

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0; padding: 0; font-size: 1.5rem;">Folha de Acompanhamento Mensal</h2>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 0.9rem;">Início: ${dataInicio} | Meta: ${meta}kg</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-family: sans-serif; font-size: 0.85rem;">
                <thead>
                    <tr style="background-color: #f0f0f0;">
                        <th style="border: 1px solid #000; padding: 5px; width: 10%; text-align: center;">Dia</th>
                        <th style="border: 1px solid #000; padding: 5px; width: 15%; text-align: center;">Data</th>
                        <th style="border: 1px solid #000; padding: 5px; width: 15%; text-align: center;">Peso (kg)</th>
                        <th style="border: 1px solid #000; padding: 5px; width: 45%; text-align: left;">Observações / Sentimento</th>
                        <th style="border: 1px solid #000; padding: 5px; width: 15%; text-align: center;">Visto</th>
                    </tr>
                </thead>
                <tbody>
                    ${Array(31).fill(0).map((_, i) => `
                        <tr>
                            <td style="border: 1px solid #000; text-align: center; font-weight: bold; padding: 2px;">${i + 1}</td>
                            <td style="border: 1px solid #000; height: 28px;"></td>
                            <td style="border: 1px solid #000;"></td>
                            <td style="border: 1px solid #000;"></td>
                            <td style="border: 1px solid #000;"></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div style="margin-top: 15px; text-align: center; font-style: italic; color: #555; font-size: 0.8em;">
                "O sucesso é a soma de pequenos esforços repetidos dia após dia."
            </div>
        </div>
    `;

    // Create temp container
    const printContainer = document.createElement('div');
    printContainer.className = 'print-section-overlay'; // New specific class to avoid conflicts
    printContainer.style.position = 'fixed';
    printContainer.style.top = '0';
    printContainer.style.left = '0';
    printContainer.style.width = '100vw';
    printContainer.style.height = '100vh';
    printContainer.style.background = 'white';
    printContainer.style.zIndex = '99999'; // Ensure it's on top
    printContainer.style.overflow = 'auto'; // Prevent crop
    printContainer.innerHTML = htmlContent;

    document.body.appendChild(printContainer);

    // Add specific style tag for this print to force visibility
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            @page { margin: 1cm; size: A4; }
            body * { visibility: hidden; }
            .print-section-overlay, .print-section-overlay * { visibility: visible; }
            .print-section-overlay { position: absolute; left: 0; top: 0; width: 100%; height: auto; margin: 0; padding: 0; }
        }
    `;
    document.head.appendChild(style);

    setTimeout(() => {
        window.print();
        setTimeout(() => {
            if (document.body.contains(printContainer)) {
                document.body.removeChild(printContainer);
                document.head.removeChild(style);
            }
        }, 500);
    }, 500);
};

window.printWeeklyTracking = () => {
    const data = Storage.getData();
    const user = Storage.getSession();
    const tracking = data.weekly_tracking || [];

    // Calcular totais
    const startWeight = tracking.length > 0 ? tracking[tracking.length - 1].start : (data.peso || 0);
    const currentWeight = tracking.length > 0 ? tracking[0].end : (data.peso || 0);
    const totalChange = currentWeight - startWeight;
    const color = totalChange <= 0 ? '#27ae60' : '#e74c3c';

    const htmlContent = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
            <div style="border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="margin: 0; color: #2c3e50; font-size: 24px;">Relatório de Evolução Semanal</h1>
                    <p style="margin: 5px 0 0; color: #7f8c8d;">${user} | Início: ${data.data_inicio}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 14px; color: #95a5a6;">Resultado Total</div>
                    <div style="font-size: 24px; font-weight: bold; color: ${color};">
                        ${totalChange > 0 ? '+' : ''}${totalChange.toFixed(1)} kg
                    </div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #2c3e50;">Data / Semana</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #2c3e50;">Peso Inicial</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #2c3e50;">Peso Final</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #2c3e50;">Resultado</th>
                    </tr>
                </thead>
                <tbody>
                    ${tracking.length === 0 ?
            `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #95a5a6;">Nenhum registro encontrado.</td></tr>` :
            tracking.map(t => {
                const diff = t.end - t.start;
                const diffColor = diff <= 0 ? '#27ae60' : '#e74c3c';
                const dateParts = t.date.split('-');
                return `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 12px; color: #2c3e50;">${dateParts[2]}/${dateParts[1]}/${dateParts[0]}</td>
                                    <td style="padding: 12px; text-align: right; color: #7f8c8d;">${t.start.toFixed(1)} kg</td>
                                    <td style="padding: 12px; text-align: right; font-weight: bold; color: #2c3e50;">${t.end.toFixed(1)} kg</td>
                                    <td style="padding: 12px; text-align: right; font-weight: bold; color: ${diffColor};">
                                        ${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg
                                    </td>
                                </tr>
                            `;
            }).join('')}
                </tbody>
            </table>

            <div style="margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                <h3 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 16px;">Anotações da IA Personal Alpha</h3>
                <p style="margin: 0; color: #7f8c8d; font-style: italic; font-size: 14px;">
                    "A consistência é o segredo do resultado. Continue registrando semanalmente!"
                </p>
            </div>
            
            <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #bdc3c7;">
                Gerado por Viver Bem PRO - ${new Date().toLocaleDateString('pt-BR')}
            </div>
        </div>
    `;

    // Create temp container
    const printContainer = document.createElement('div');
    printContainer.className = 'print-section-overlay';
    printContainer.style.background = 'white';
    printContainer.innerHTML = htmlContent;

    document.body.appendChild(printContainer);

    // Reuse existing print style or ensure it exists
    if (!document.querySelector('#print-style-overlay')) {
        const style = document.createElement('style');
        style.id = 'print-style-overlay';
        style.innerHTML = `
            @media print {
                @page { margin: 1cm; size: A4; }
                body * { visibility: hidden; }
                .print-section-overlay, .print-section-overlay * { visibility: visible; }
                .print-section-overlay { position: absolute; left: 0; top: 0; width: 100%; min-height: 100vh; background: white; z-index: 99999; }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        window.print();
        setTimeout(() => {
            if (document.body.contains(printContainer)) {
                document.body.removeChild(printContainer);
            }
        }, 500);
    }, 500);
};

window.toggleEquipamentos = (local) => {
    const container = document.getElementById('equipamentos-container');
    if (container) container.style.display = local === 'casa' ? 'block' : 'none';
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';

    // Check if it's the evolution tab to render chart
    if (tabId === 'evolucao-ai') {
        renderChart();
        updateAIFeedback();
    }

    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(`'${tabId}'`));
    if (activeBtn) activeBtn.classList.add('active');
};

window.switchSubTab = (subTabId) => {
    document.querySelectorAll('.sub-tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(subTabId).style.display = 'block';
    // event.currentTarget might not be available if called programmatically, but fine for direct click
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

window.abrirModalRegistro = () => {
    document.getElementById('modal-registro').style.display = 'flex';
};

window.fecharModalRegistro = () => {
    document.getElementById('modal-registro').style.display = 'none';
};

window.salvarProgressoSemanal = () => {
    const novoPesoInput = document.getElementById('novo-peso');
    if (!novoPesoInput) return; // Ensure input exists
    const novoPeso = parseFloat(novoPesoInput.value);
    if (isNaN(novoPeso) || !novoPeso) return alert('Insira um peso válido');

    let data = Storage.getData();
    if (!data) return alert('Nenhum plano ativo para registrar peso.');

    const hoje = new Date().toLocaleDateString('pt-BR');

    if (!data.historico) data.historico = [];
    data.historico.push({ data: hoje, peso: novoPeso });

    Storage.updateUser(Storage.getSession(), data); // Save updated data for current user
    fecharModalRegistro();
    renderChart();
    updateAIFeedback();
    renderDashboard(); // Update dashboard with new weight
};
