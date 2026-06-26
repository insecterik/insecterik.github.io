const especies=[{titulo:'Mariposa Morpho',categoria:'Mariposas',subcategoria:'Morphinae',descripcion:'Ejemplo',imagen:'https://picsum.photos/600/400'}];
const g=document.getElementById('gallery');
function render(cat=''){g.innerHTML='';especies.filter(e=>!cat||e.categoria===cat).forEach(e=>g.innerHTML+=`<div class="card"><img src="${e.imagen}"><h3>${e.titulo}</h3><p>${e.categoria} > ${e.subcategoria}</p><p>${e.descripcion}</p></div>`);}
render();
document.querySelectorAll('#cats button').forEach(b=>b.onclick=()=>render(b.dataset.cat));
