// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = "https://tfuhkgfgvgjklvutsstb.supabase.co";
const SUPABASE_KEY = "sb_publishable_TXiMH9YUgS2U8yjqIQJCNA_vCGn9EQW";

// Força parâmetros básicos de conexão estável na inicialização
const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// --- DADOS E VARIÁVEIS GLOBAIS ---
let categorias = {}; // Preenchido dinamicamente buscando da tabela 'produtos'
let carrinho = [];
let canalPedidosRealtime = null;  // Guarda a conexão em tempo real dos pedidos
let canalProdutosRealtime = null; // Guarda a conexão em tempo real do cardápio do cliente

// --- CONFIGURAÇÃO DO ÁUDIO ---
const somNovoPedido = new Audio('assets/sounds/sino.mp3'); 

// --- NAVEGAÇÃO E CONTROLE DA TELA DE LOGIN ---
function voltarInicio() {
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("menuScreen").classList.add("hidden");
  document.getElementById("funcionarioScreen").classList.add("hidden");
  
  // Desconecta as assinaturas em tempo real ao deslogar para liberar memória
  if (canalPedidosRealtime) {
    clienteSupabase.removeChannel(canalPedidosRealtime);
    canalPedidosRealtime = null;
  }
  if (canalProdutosRealtime) {
    clienteSupabase.removeChannel(canalProdutosRealtime);
    canalProdutosRealtime = null;
  }

  // Desconecta a sessão do usuário no Supabase Auth por segurança
  clienteSupabase.auth.signOut();
}

async function entrarCliente() {
  // Abre o carregando enquanto busca o cardápio dinâmico no banco
  Swal.showLoading();
  const carregou = await carregarProdutosDoBanco();
  Swal.close();

  if (!carregou) {
    Swal.fire("Erro", "Não foi possível carregar o cardápio. Tente novamente.", "error");
    return;
  }

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("menuScreen").classList.remove("hidden");
  renderProdutos();

  // Ativa a escuta imediata de alterações no banco (Sem precisar de F5)
  inicializarRealtimeProdutosCliente();
}

// Mostra o formulário secreto de e-mail e senha do funcionário
function mostrarFormFuncionario() {
  document.getElementById("loginOptions").classList.add("hidden");
  document.getElementById("funcForm").classList.remove("hidden");
}

// Cancela o login do funcionário e volta para a tela de escolha inicial
function cancelarLoginFunc() {
  document.getElementById("loginOptions").classList.remove("hidden");
  document.getElementById("funcForm").classList.add("hidden");
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginSenha").value = "";
}

// Alterna entre o módulo de Pedidos e o módulo de Produtos do Funcionário
function alternarModuloFuncionario(modulo) {
  const abaPedidos = document.getElementById("btnAbaPedidos");
  const abaProdutos = document.getElementById("btnAbaProdutos");
  const modPedidos = document.getElementById("moduloPedidos");
  const modProdutos = document.getElementById("moduloProdutos");

  if (modulo === 'pedidos') {
    abaPedidos.className = "btn btn-warning active";
    abaProdutos.className = "btn btn-outline-warning";
    modPedidos.classList.remove("hidden");
    modProdutos.classList.add("hidden");
    carregarPedidos();
  } else {
    abaPedidos.className = "btn btn-outline-warning";
    abaProdutos.className = "btn btn-warning active";
    modPedidos.classList.add("hidden");
    modProdutos.classList.remove("hidden");
    carregarProdutosGestao();
  }
}

// --- BUSCA DINÂMICA DO CARDÁPIO (BANCO DE DADOS) ---
async function carregarProdutosDoBanco() {
  try {
    // Ordenamos por 'id' ascendente para manter a sequência de inserção
    const { data: listaProdutos, error } = await clienteSupabase
      .from("produtos")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    // Resetamos o objeto estrutural
    categorias = {
      sanduiches: [],
      bebidas: [],
      acompanhamentos: []
    };

    // Organiza os produtos vindos do banco dentro de suas respectivas categorias
    listaProdutos.forEach(produto => {
      if (categorias[produto.categoria]) {
        categorias[produto.categoria].push({
          id: produto.id,
          nome: produto.nome,
          preco: produto.preco,
          img: produto.img,
          categoria: produto.categoria
        });
      }
    });

    for (let cat in categorias) {
      categorias[cat].sort((a, b) => a.nome.localeCompare(b.nome));
    }

    return true;
  } catch (err) {
    console.error("Erro ao carregar produtos:", err.message);
    return false;
  }
}

// --- ESCUTA EM TEMPO REAL DO CARDÁPIO DO CLIENTE ---
function inicializarRealtimeProdutosCliente() {
  if (canalProdutosRealtime) {
    clienteSupabase.removeChannel(canalProdutosRealtime);
  }

  // Define o canal explicitando o escopo público da tabela do banco
  canalProdutosRealtime = clienteSupabase
    .channel('public:produtos')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'produtos' },
      async (payload) => {
        console.log("Cardápio modificado no banco de dados! Atualizando tela...", payload);
        await carregarProdutosDoBanco();
        renderProdutos();
      }
    );

  // Ativa a inscrição e adiciona logs de monitoramento no Console (F12)
  canalProdutosRealtime.subscribe((status) => {
    console.log("Status da sincronização em tempo real do Cliente:", status);
    if (status === "CHANNEL_ERROR") {
      console.warn("Dica: Se as atualizações automáticas falharem, certifique-se de que o RLS da tabela 'produtos' está desativado ou possui política de SELECT aberta para anonymous/public.");
    }
  });
}

// --- AUXILIAR: FAZ UPLOAD FÍSICO DO ARQUIVO PARA O STORAGE ---
async function uploadFotoProduto(arquivo) {
  try {
    const extensao = arquivo.name.split('.').pop();
    const nomeArquivo = `${Date.now()}.${extensao}`;

    const { data, error } = await clienteSupabase.storage
      .from('imagens-produtos')
      .upload(nomeArquivo, arquivo);

    if (error) throw error;

    const { data: publicUrlData } = clienteSupabase.storage
      .from('imagens-produtos')
      .getPublicUrl(nomeArquivo);

    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Erro no upload da imagem:", err.message);
    Swal.fire("Erro no Upload", "Não foi possível enviar o arquivo de imagem.", "error");
    return null;
  }
}

// --- SISTEMA DE AUTENTICAÇÃO (LOGIN REAL DO FUNCIONÁRIO) ---
async function entrarFuncionarioReal() {
  const email = document.getElementById("loginEmail").value;
  const senha = document.getElementById("loginSenha").value;

  if (!email || !senha) {
    Swal.fire("Aviso", "Preencha todos os campos!", "warning");
    return;
  }

  Swal.showLoading();

  // 1️⃣ ETAPA: Autentica o usuário na tabela auth.users do Supabase
  const { data: authData, error: authError } = await clienteSupabase.auth.signInWithPassword({
    email: email,
    password: senha,
  });

  if (authError) {
    Swal.close();
    Swal.fire("Erro de Autenticação", "E-mail ou senha incorretos.", "error");
    return;
  }

  const usuarioId = authData.user.id;

  // 2️⃣ ETAPA: Verifica se o ID do usuário possui o cargo de 'funcionario' na tabela pública 'perfis'
  const { data: perfil, error: perfilError } = await clienteSupabase
    .from("perfis")
    .select("cargo")
    .eq("id", usuarioId)
    .single();

  Swal.close(); // Fecha o carregando

  if (perfilError || !perfil || perfil.cargo !== 'funcionario') {
    await clienteSupabase.auth.signOut();
    Swal.fire("Acesso Negado", "Seu usuário não tem permissão de funcionário.", "error");
    return;
  }

  // 3️⃣ ETAPA: Se tudo estiver correto, limpa os blocos de login e inicia o painel do funcionário
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("funcForm").classList.add("hidden");
  document.getElementById("loginOptions").classList.remove("hidden");
  
  alternarModuloFuncionario('pedidos'); 
  inicializarPainelFuncionario();
}

// --- GESTÃO DE PEDIDOS (FUNCIONÁRIO) ---
async function inicializarPainelFuncionario() {
  document.getElementById("funcionarioScreen").classList.remove("hidden");

  await carregarPedidos();

  if (canalPedidosRealtime) {
    clienteSupabase.removeChannel(canalPedidosRealtime);
  }

  canalPedidosRealtime = clienteSupabase
    .channel('atualizacoes-pedidos')
    .on(
      'postgres_changes',
      {
        event: '*', 
        schema: 'public',
        table: 'pedidos'
      },
      (payload) => {
        console.log("Banco updated!", payload);

        if (payload.eventType === 'INSERT') {
          somNovoPedido.play().catch(error => {
            console.log("Áudio bloqueado pelo navegador.", error);
          });

          const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true
          });
          Toast.fire({
            icon: 'info',
            title: 'Novo pedido recebido! 🔔🍔'
          });
        }

        carregarPedidos(); 
      }
    )
    .subscribe();
}

async function carregarPedidos() {
  const { data, error } = await clienteSupabase
    .from("pedidos")
    .select("*")
    .in("status", ["Pendente", "Preparando"])
    .order("id", { ascending: false });

  if (error) {
    Swal.fire("Erro", error.message, "error");
    return;
  }

  const lista = document.getElementById("listaPedidos");
  lista.innerHTML = "";

  if (data.length === 0) {
    lista.innerHTML = `<h3 class="text-center mt-4">Nenhum pedido pendente 🍔</h3>`;
    return;
  }

  const pendentes = data.filter(p => p.status === "Pendente");
  const preparando = data.filter(p => p.status === "Preparando");

  function renderPedido(pedido) {
    let itensHTML = "";
    pedido.itens.forEach(item => {
      itensHTML += `<li>${item.nome} (x${item.qtd}) - R$ ${item.preco * item.qtd}</li>`;
    });

    return `
      <div class="card-food mb-4">
        <h4>Pedido #${pedido.id}</h4>
        <p><strong>Cliente:</strong> ${pedido.cliente}</p>
        <p><strong>Pagamento:</strong> ${pedido.pagamento}</p>
        <p><strong>Itens:</strong></p>
        <ul>${itensHTML}</ul>
        <p><strong>Total:</strong> R$ ${pedido.total}</p>
        <p><strong>Status:</strong> ${pedido.status}</p>
        <button class="btn btn-warning me-2" onclick="mudarStatus(${pedido.id}, 'Preparando')">
          Preparando
        </button>
        <button class="btn btn-success" onclick="mudarStatus(${pedido.id}, 'Finalizado')">
          Finalizado
        </button>
      </div>
    `;
  }

  lista.innerHTML += `<h2 class="text-warning mb-4">🟡 Pendentes</h2>`;
  pendentes.forEach(p => { lista.innerHTML += renderPedido(p); });

  lista.innerHTML += `<h2 class="text-warning mt-5 mb-4">🟠 Preparando</h2>`;
  preparando.forEach(p => { lista.innerHTML += renderPedido(p); });
}

async function mudarStatus(id, novoStatus) {
  const { error } = await clienteSupabase
    .from("pedidos")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) {
    Swal.fire("Erro", error.message, "error");
    return;
  }
}

// --- CRUD: GESTÃO DE PRODUTOS DO CARDÁPIO ---
async function carregarProdutosGestao() {
  const container = document.getElementById("listaProdutosGestao");
  container.innerHTML = "<p class='text-light text-center'>Carregando itens...</p>";

  // Buscamos tudo ordenado por ID do banco
  const { data: produtos, error } = await clienteSupabase
    .from("produtos")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    Swal.fire("Erro", "Falha ao sincronizar produtos com o banco de dados.", "error");
    return;
  }

  // CORREÇÃO: Separamos em blocos fixos obedecendo a ordem: sanduiches -> bebidas -> acompanhamentos
  const ordemGestao = {
    sanduiches: [],
    bebidas: [],
    acompanhamentos: []
  };

  produtos.forEach(prod => {
    if (ordemGestao[prod.categoria]) {
      ordemGestao[prod.categoria].push(prod);
    }
  });

  Object.keys(ordemGestao).forEach(cat => {
    ordemGestao[cat].sort((a, b) => a.nome.localeCompare(b.nome));
  });

  container.innerHTML = "";
  
  // Renderiza seguindo estritamente o laço controlado da ordem desejada
  const chavesOrdem = ["sanduiches", "bebidas", "acompanhamentos"];
  chavesOrdem.forEach(cat => {
    ordemGestao[cat].forEach(prod => {
      container.innerHTML += `
        <div class="col-md-4 mb-4">
          <div class="card-food h-100 d-flex flex-column justify-content-between">
            <div>
              <img src="${prod.img}" class="food-img" alt="${prod.nome}">
              <h4 class="mt-3 text-white">${prod.nome}</h4>
              <p class="text-warning mb-1">R$ ${parseFloat(prod.preco).toFixed(2)}</p>
              <span class="badge bg-secondary text-capitalize">${prod.categoria}</span>
            </div>
            <div class="mt-3 d-flex gap-2">
              <button class="btn btn-sm btn-primary w-100" onclick="abrirModalEditarProduto(${prod.id}, '${prod.nome}', ${prod.preco}, '${prod.categoria}', '${prod.img}')">
                <i class="fas fa-edit me-1"></i>Editar
              </button>
              <button class="btn btn-sm btn-danger w-100" onclick="excluirProduto(${prod.id})">
                <i class="fas fa-trash me-1"></i>Excluir
              </button>
            </div>
          </div>
        </div>
      `;
    });
  });
}

async function abrirModalCriarProduto() {
  const { value: formValues } = await Swal.fire({
    title: '🍔 Novo Produto',
    html:
      '<input id="swal-nome" class="swal2-input" placeholder="Nome do Produto">' +
      '<input id="swal-preco" type="number" step="0.01" class="swal2-input" placeholder="Preço (Ex: 15.50)">' +
      '<select id="swal-categoria" class="swal2-input">' +
        '<option value="sanduiches">Sanduíches</option>' +
        '<option value="bebidas">Bebidas</option>' +
        '<option value="acompanhamentos">Acompanhamentos</option>' +
      '</select>' +
      '<div class="mt-3 text-start px-4">' +
        '<label class="text-white-50 small mb-1 d-block">Selecionar Imagem do Dispositivo:</label>' +
        '<input id="swal-file" type="file" accept="image/*" class="form-control bg-dark text-white border-secondary">' +
      '</div>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Cadastrar',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      return {
        nome: document.getElementById('swal-nome').value,
        preco: parseFloat(document.getElementById('swal-preco').value),
        categoria: document.getElementById('swal-categoria').value,
        fotoInput: document.getElementById('swal-file').files[0]
      }
    }
  });

  if (!formValues) return;
  if (!formValues.nome || isNaN(formValues.preco) || !formValues.fotoInput) {
    Swal.fire("Aviso", "Todos os campos estruturais e o arquivo de imagem são obrigatórios!", "warning");
    return;
  }

  Swal.showLoading();

  // Envia a imagem selecionada ao Storage do Supabase
  const urlImagemPublica = await uploadFotoProduto(formValues.fotoInput);
  if (!urlImagemPublica) { Swal.close(); return; }

  const dadosProduto = {
    nome: formValues.nome,
    preco: formValues.preco,
    categoria: formValues.categoria,
    img: urlImagemPublica
  };

  const { error } = await clienteSupabase.from("produtos").insert([dadosProduto]);
  Swal.close();

  if (error) {
    Swal.fire("Erro", error.message, "error");
  } else {
    Swal.fire("Sucesso!", "Novo produto inserido com imagem salva em nuvem.", "success");
    carregarProdutosGestao();
  }
}

async function abrirModalEditarProduto(id, nomeAtual, precoAtual, catAtual, imgAtual) {
  const { value: formValues } = await Swal.fire({
    title: '✏️ Editar Produto',
    html:
      `<input id="swal-edit-nome" class="swal2-input" placeholder="Nome" value="${nomeAtual}">` +
      `<input id="swal-edit-preco" type="number" step="0.01" class="swal2-input" placeholder="Preço" value="${precoAtual}">` +
      `<select id="swal-edit-categoria" class="swal2-input">` +
        `<option value="sanduiches" ${catAtual === 'sanduiches' ? 'selected' : ''}>Sanduíches</option>` +
        `<option value="bebidas" ${catAtual === 'bebidas' ? 'selected' : ''}>Bebidas</option>` +
        `<option value="acompanhamentos" ${catAtual === 'acompanhamentos' ? 'selected' : ''}>Acompanhamentos</option>` +
      `</select>` +
      '<div class="mt-3 text-start px-4">' +
        '<label class="text-white-50 small mb-1 d-block">Substituir Foto Atual (Opcional):</label>' +
        '<input id="swal-edit-file" type="file" accept="image/*" class="form-control bg-dark text-white border-secondary">' +
      '</div>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Salvar Alterações',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      return {
        nome: document.getElementById('swal-edit-nome').value,
        preco: parseFloat(document.getElementById('swal-edit-preco').value),
        categoria: document.getElementById('swal-edit-categoria').value,
        fotoInput: document.getElementById('swal-edit-file').files[0]
      }
    }
  });

  if (!formValues) return;

  Swal.showLoading();

  const dadosAtualizados = {
    nome: formValues.nome,
    preco: formValues.preco,
    categoria: formValues.categoria,
    img: imgAtual 
  };

  if (formValues.fotoInput) {
    const novaUrl = await uploadFotoProduto(formValues.fotoInput);
    if (!novaUrl) { Swal.close(); return; }
    dadosAtualizados.img = novaUrl;
  }

  const { error } = await clienteSupabase.from("produtos").update(dadosAtualizados).eq("id", id);
  Swal.close();

  if (error) {
    Swal.fire("Erro", error.message, "error");
  } else {
    Swal.fire("Atualizado!", "Dados do produto salvos perfeitamente.", "success");
    carregarProdutosGestao();
  }
}

async function excluirProduto(id) {
  const resultado = await Swal.fire({
    title: 'Deletar item?',
    text: "O item selecionado sairá de forma permanente do cardápio digital!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Confirmar Exclusão',
    cancelButtonText: 'Cancelar'
  });

  if (!resultado.isConfirmed) return;

  Swal.showLoading();
  const { error } = await clienteSupabase.from("produtos").delete().eq("id", id);
  Swal.close();

  if (error) {
    Swal.fire("Erro", error.message, "error");
  } else {
    Swal.fire("Concluído!", "O produto foi retirado do catálogo.", "success");
    carregarProdutosGestao();
  }
}

// --- SISTEMA DE PEDIDOS (CLIENTE) ---
function renderProdutos() {
  const foods = document.getElementById("foods");
  foods.innerHTML = "";

  // CORREÇÃO: Array explícito mapeando a ordem correta na tela do cliente
  const chavesOrdem = ["sanduiches", "bebidas", "acompanhamentos"];

  chavesOrdem.forEach(categoria => {
    if (!categorias[categoria] || categorias[categoria].length === 0) return;

    foods.innerHTML += `
      <h2 class="mt-5 mb-4 text-warning text-capitalize">${categoria}</h2>
    `;

    categorias[categoria].forEach((p) => {
      foods.innerHTML += `
        <div class="col-md-4 mb-4">
          <div class="card-food">
            <img src="${p.img}" class="food-img" alt="${p.nome}">
            <h4 class="mt-3">${p.nome}</h4>
            <p>R$ ${parseFloat(p.preco).toFixed(2)}</p>
            <button class="btn btn-order w-100" onclick="addCarrinho('${p.nome}', ${p.preco})">
              Adicionar
            </button>
          </div>
        </div>
      `;
    });
  });
}

function addCarrinho(nome, preco) {
  const item = carrinho.find(i => i.nome === nome);

  if (item) {
    item.qtd++;
  } else {
    carrinho.push({ nome, preco, qtd: 1 });
  }

  atualizarCarrinho();

  Swal.fire({
    icon: 'success',
    title: 'Adicionado!',
    timer: 800,
    showConfirmButton: false
  });
}

function alterarQtd(nome, delta) {
  const item = carrinho.find(i => i.nome === nome);

  if (item) {
    item.qtd += delta;
    if (item.qtd <= 0) {
      carrinho = carrinho.filter(i => i.nome !== nome);
    }
  }
  atualizarCarrinho();
}

function removerItem(nome) {
  carrinho = carrinho.filter(i => i.nome !== nome);
  atualizarCarrinho();
}

function atualizarCarrinho() {
  const lista = document.getElementById("cartItems");
  lista.innerHTML = "";
  let total = 0;

  carrinho.forEach(item => {
    total += item.preco * item.qtd;
    lista.innerHTML += `
      <li class="mb-3">
        <strong>${item.nome}</strong><br>
        <button onclick="alterarQtd('${item.nome}', -1)">-</button>
        ${item.qtd}
        <button onclick="alterarQtd('${item.nome}', 1)">+</button>
        <br>
        R$ ${(item.preco * item.qtd).toFixed(2)}
        <br>
        <button class="btn btn-sm btn-danger mt-2" onclick="removerItem('${item.nome}')">
          Remover
        </button>
      </li>
    `;
  });

  document.getElementById("total").innerText = total.toFixed(2);
}

async function salvarPedido() {
  const nomeCliente = document.getElementById("nomeCliente").value;
  const pagamento = document.getElementById("pagamento").value;

  if (!nomeCliente) {
    Swal.fire("Aviso", "Digite seu nome para continuarmos.", "warning");
    return false;
  }

  const total = carrinho.reduce((acc, item) => acc + (item.preco * item.qtd), 0);

  const { error } = await clienteSupabase
    .from("pedidos")
    .insert([{
      cliente: nomeCliente,
      pagamento,
      status: "Pendente",
      itens: carrinho,
      total
    }]);

  if (error) {
    Swal.fire("Erro", error.message, "error");
    return false;
  }
  return true;
}

async function finalizarPedido() {
  if (carrinho.length === 0) {
    Swal.fire("Aviso", "Carrinho vazio! Adicione itens primeiro.", "warning");
    return;
  }

  const salvo = await salvarPedido();
  if (!salvo) return;

  Swal.fire("Pedido realizado!", "Pedido salvo 🍔", "success");
  carrinho = [];
  atualizarCarrinho();
  document.getElementById("nomeCliente").value = ""; 
}