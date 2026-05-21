const SUPABASE_URL =
"https://tfuhkgfgvgjklvutsstb.supabase.co";

const SUPABASE_KEY =
"sb_publishable_TXiMH9YUgS2U8yjqIQJCNA_vCGn9EQW";

const clienteSupabase =
supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

const categorias = {

sanduiches:[
{nome:"X-Bacon",preco:18,img:"assets/images/x-bacon.jpg"},
{nome:"X-Eggs",preco:16,img:"assets/images/x-eggs.jpg"},
{nome:"X-Chicken",preco:19,img:"assets/images/x-chicken.jpg"},
{nome:"X-Burger",preco:15,img:"assets/images/x-burger.jpg"}
],

bebidas:[
{nome:"Refrigerante",preco:6,img:"assets/images/refrigerante.jpg"},
{nome:"Água Mineral",preco:4,img:"assets/images/agua.jpg"},
{nome:"Suco Natural",preco:8,img:"assets/images/suco.jpg"}
],

acompanhamentos:[
{nome:"Batata Frita",preco:12,img:"assets/images/batata.jpg"},
{nome:"Pastel",preco:9,img:"assets/images/pastel.jpg"},
{nome:"Onion Rings",preco:14,img:"assets/images/onionrings.jpg"}
]

};

let carrinho=[];


function voltarInicio(){

document.getElementById("loginScreen")
.classList.remove("hidden");

document.getElementById("menuScreen")
.classList.add("hidden");

document.getElementById("funcionarioScreen")
.classList.add("hidden");

}


function entrarCliente(){

document.getElementById("loginScreen")
.classList.add("hidden");

document.getElementById("menuScreen")
.classList.remove("hidden");

renderProdutos();

}


function renderProdutos(){

const foods=document.getElementById("foods");

foods.innerHTML="";

for(let categoria in categorias){

foods.innerHTML+=`
<h2 class="mt-5 mb-4 text-warning text-capitalize">
${categoria}
</h2>
`;

categorias[categoria].forEach((p)=>{

foods.innerHTML+=`

<div class="col-md-4 mb-4">

<div class="card-food">

<img src="${p.img}" class="food-img">

<h4 class="mt-3">${p.nome}</h4>

<p>R$ ${p.preco}</p>

<button
class="btn btn-order w-100"
onclick="addCarrinho('${p.nome}',${p.preco})">

Adicionar

</button>

</div>

</div>
`;
});
}
}


function addCarrinho(nome,preco){

const item=carrinho.find(
i=>i.nome===nome
);

if(item){
item.qtd++;
}else{
carrinho.push({
nome,
preco,
qtd:1
});
}

atualizarCarrinho();

Swal.fire({
icon:'success',
title:'Adicionado!',
timer:800,
showConfirmButton:false
});

}


function alterarQtd(nome,delta){

const item=carrinho.find(
i=>i.nome===nome
);

if(item){

item.qtd+=delta;

if(item.qtd<=0){

carrinho=
carrinho.filter(
i=>i.nome!==nome
);

}
}

atualizarCarrinho();

}


function removerItem(nome){

carrinho=
carrinho.filter(
i=>i.nome!==nome
);

atualizarCarrinho();

}


function atualizarCarrinho(){

const lista=
document.getElementById("cartItems");

lista.innerHTML="";

let total=0;

carrinho.forEach(item=>{

total+=item.preco*item.qtd;

lista.innerHTML+=`

<li class="mb-3">

<strong>${item.nome}</strong><br>

<button onclick="alterarQtd('${item.nome}',-1)">-</button>

${item.qtd}

<button onclick="alterarQtd('${item.nome}',1)">+</button>

<br>

R$ ${item.preco*item.qtd}

<br>

<button
class="btn btn-sm btn-danger mt-2"
onclick="removerItem('${item.nome}')">

Remover

</button>

</li>
`;
});

document.getElementById("total")
.innerText=total;

}


async function salvarPedido(){

const nomeCliente=
document.getElementById("nomeCliente").value;

const pagamento=
document.getElementById("pagamento").value;

if(!nomeCliente){

Swal.fire(
"Digite seu nome"
);

return false;

}

const total=
carrinho.reduce(
(acc,item)=>
acc+(item.preco*item.qtd),
0
);

const {error}=
await clienteSupabase
.from("pedidos")
.insert([{

cliente:nomeCliente,
pagamento,
status:"Pendente",
itens:carrinho,
total

}]);

if(error){

Swal.fire(
"Erro",
error.message,
"error"
);

return false;

}

return true;

}


async function finalizarPedido(){

if(carrinho.length===0){

Swal.fire(
"Carrinho vazio"
);

return;

}

const salvo=
await salvarPedido();

if(!salvo)return;

Swal.fire(
"Pedido realizado!",
"Pedido salvo 🍔",
"success"
);

carrinho=[];

atualizarCarrinho();

}


async function entrarFuncionario(){

document.getElementById("loginScreen")
.classList.add("hidden");

document.getElementById("funcionarioScreen")
.classList.remove("hidden");

carregarPedidos();

}


async function carregarPedidos(){

const {data,error}=
await clienteSupabase
.from("pedidos")
.select("*")
.in("status",[
"Pendente",
"Preparando"
])
.order("id",{
ascending:false
});

if(error){

Swal.fire(
"Erro",
error.message,
"error"
);

return;

}

const lista=
document.getElementById("listaPedidos");

lista.innerHTML="";

if(data.length===0){

lista.innerHTML=`
<h3 class="text-center">
Nenhum pedido pendente 🍔
</h3>
`;

return;

}

const pendentes=
data.filter(
p=>p.status==="Pendente"
);

const preparando=
data.filter(
p=>p.status==="Preparando"
);


function renderPedido(pedido){

let itensHTML="";

pedido.itens.forEach(item=>{

itensHTML+=`
<li>
${item.nome}
(x${item.qtd})
- R$ ${item.preco*item.qtd}
</li>
`;

});

return `

<div class="card-food mb-4">

<h4>Pedido #${pedido.id}</h4>

<p>
<strong>Cliente:</strong>
${pedido.cliente}
</p>

<p>
<strong>Pagamento:</strong>
${pedido.pagamento}
</p>

<p>
<strong>Itens:</strong>
</p>

<ul>
${itensHTML}
</ul>

<p>
<strong>Total:</strong>
R$ ${pedido.total}
</p>

<p>
<strong>Status:</strong>
${pedido.status}
</p>

<button
class="btn btn-warning me-2"
onclick="mudarStatus(
${pedido.id},
'Preparando'
)">

Preparando

</button>

<button
class="btn btn-success"
onclick="mudarStatus(
${pedido.id},
'Finalizado'
)">

Finalizado

</button>

</div>
`;
}


lista.innerHTML+=`
<h2 class="text-warning mb-4">
🟡 Pedentes
</h2>
`;

pendentes.forEach(p=>{

lista.innerHTML+=
renderPedido(p);

});


lista.innerHTML+=`
<h2 class="text-warning mt-5 mb-4">
🟠 Preparando
</h2>
`;

preparando.forEach(p=>{

lista.innerHTML+=
renderPedido(p);

});

}


async function mudarStatus(
id,
novoStatus
){

const {error}=
await clienteSupabase
.from("pedidos")
.update({
status:novoStatus
})
.eq("id",id);

if(error){

Swal.fire(
"Erro",
error.message,
"error"
);

return;

}

carregarPedidos();

}
