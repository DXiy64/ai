import Plotly from 'plotly.js-gl3d-dist-min';
import data from './data.json';
import './style.css';

const models=data.models.filter(m=>[m.intelligence,m.cost,m.timeSeconds].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0));
const providers=[...new Set(models.map(m=>m.creator))].sort();
const colors={OpenAI:'#25805c',Anthropic:'#c16e47',Meta:'#1877d2',Google:'#9366ce',NVIDIA:'#659626',SpaceXAI:'#6d5abe','Institute of Foundation Models':'#405cc5'};
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

document.querySelector('#app').innerHTML=`<main aria-label="AI 模型三维图"><div id="chart" aria-label="X：Intelligence Index；Y：Cost per Task（USD）；Z：Time per Task（分钟）"></div><nav aria-label="切换图表视角"><button data-view="3d" aria-pressed="true">自由 3D</button><button data-view="xy" aria-pressed="false">能力 × 成本</button><button data-view="xz" aria-pressed="false">能力 × 时间</button><button data-view="yz" aria-pressed="false">成本 × 时间</button><button id="reset" aria-label="复位三维视角" title="复位三维视角">↺</button></nav><p id="error" role="alert" hidden>图表加载失败，请确认浏览器支持 WebGL 后刷新。</p></main>`;
const chart=document.querySelector('#chart');
const cameras={
 '3d':{eye:{x:1.65,y:1.65,z:1.1},up:{x:0,y:0,z:1},projection:{type:'perspective'}},
 xy:{eye:{x:0,y:0,z:2.5},up:{x:0,y:1,z:0},projection:{type:'orthographic'}},
 xz:{eye:{x:0,y:2.5,z:0},up:{x:0,y:0,z:1},projection:{type:'orthographic'}},
 yz:{eye:{x:2.5,y:0,z:0},up:{x:0,y:0,z:1},projection:{type:'orthographic'}}
};
const axis=title=>({title:{text:title,font:{size:13,color:'#465366'}},gridcolor:'#e0e6ee',zerolinecolor:'#c5cfdb',linecolor:'#c5cfdb',showbackground:true,backgroundcolor:'#f8fafc',tickfont:{size:11,color:'#69768a'},color:'#465366',showspikes:false});
const traces=providers.map(provider=>{
 const group=models.filter(m=>m.creator===provider);
 return {type:'scatter3d',mode:'markers',name:provider,x:group.map(m=>m.intelligence),y:group.map(m=>m.cost),z:group.map(m=>m.timeSeconds/60),text:group.map(m=>escape(m.name)),marker:{size:5,color:colors[provider]||group[0].color,opacity:.9,line:{color:'#ffffff',width:.6}},hovertemplate:'<b>%{text}</b><br>Intelligence Index: %{x:.2f}<br>Cost per Task: $%{y:.4f}<br>Time per Task: %{z:.2f} min<extra>'+escape(provider)+'</extra>'};
});
async function setView(view){await Plotly.relayout(chart,{'scene.camera':cameras[view]});document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));}
Plotly.newPlot(chart,traces,{paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',font:{family:'Segoe UI, Microsoft YaHei, sans-serif',color:'#465366'},margin:{l:20,r:20,t:20,b:75},showlegend:false,scene:{xaxis:axis('X · Intelligence Index'),yaxis:{...axis('Y · Cost per Task (USD)'),tickprefix:'$'},zaxis:axis('Z · Time per Task (min)'),aspectmode:'cube',camera:cameras['3d'],dragmode:'orbit'},hoverlabel:{bgcolor:'#ffffff',bordercolor:'#cbd5e1',font:{color:'#26354a',size:12}}},{responsive:true,displayModeBar:false,scrollZoom:true}).then(()=>{document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));document.querySelector('#reset').addEventListener('click',()=>setView('3d'));}).catch(error=>{document.querySelector('#error').hidden=false;console.error(error);});
