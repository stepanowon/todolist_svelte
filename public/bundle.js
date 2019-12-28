var app=function(){"use strict";function t(){}function e(t){return t()}function n(){return Object.create(null)}function o(t){t.forEach(e)}function s(t){return"function"==typeof t}function c(t,e){return t!=t?e==e:t!==e||t&&"object"==typeof t||"function"==typeof t}function l(t,e){t.appendChild(e)}function r(t,e,n){t.insertBefore(e,n||null)}function a(t){t.parentNode.removeChild(t)}function i(t){return document.createElement(t)}function u(t){return document.createTextNode(t)}function d(){return u(" ")}function f(t,e,n,o){return t.addEventListener(e,n,o),()=>t.removeEventListener(e,n,o)}function p(t,e,n){null==n?t.removeAttribute(e):t.getAttribute(e)!==n&&t.setAttribute(e,n)}let g;function m(t){g=t}const h=[],$=[],b=[],k=[],y=Promise.resolve();let x=!1;function v(t){b.push(t)}function w(){const t=new Set;do{for(;h.length;){const t=h.shift();m(t),_(t.$$)}for(;$.length;)$.pop()();for(let e=0;e<b.length;e+=1){const n=b[e];t.has(n)||(n(),t.add(n))}b.length=0}while(h.length);for(;k.length;)k.pop()();x=!1}function _(t){if(null!==t.fragment){t.update(),o(t.before_update);const e=t.dirty;t.dirty=[-1],t.fragment&&t.fragment.p(t.ctx,e),t.after_update.forEach(v)}}const T=new Set;let E;function M(t,e){t&&t.i&&(T.delete(t),t.i(e))}function A(t,e,n,o){if(t&&t.o){if(T.has(t))return;T.add(t),E.c.push(()=>{T.delete(t),o&&(n&&t.d(1),o())}),t.o(e)}}function C(t,e){A(t,1,1,()=>{e.delete(t.key)})}function R(t){t&&t.c()}function S(t,n,c){const{fragment:l,on_mount:r,on_destroy:a,after_update:i}=t.$$;l&&l.m(n,c),v(()=>{const n=r.map(e).filter(s);a?a.push(...n):o(n),t.$$.on_mount=[]}),i.forEach(v)}function D(t,e){const n=t.$$;null!==n.fragment&&(o(n.on_destroy),n.fragment&&n.fragment.d(e),n.on_destroy=n.fragment=null,n.ctx=[])}function I(t,e){-1===t.$$.dirty[0]&&(h.push(t),x||(x=!0,y.then(w)),t.$$.dirty.fill(0)),t.$$.dirty[e/31|0]|=1<<e%31}function L(e,s,c,l,r,a,i=[-1]){const u=g;m(e);const d=s.props||{},f=e.$$={fragment:null,ctx:null,props:a,update:t,not_equal:r,bound:n(),on_mount:[],on_destroy:[],before_update:[],after_update:[],context:new Map(u?u.$$.context:[]),callbacks:n(),dirty:i};let p=!1;var h;f.ctx=c?c(e,d,(t,n,o=n)=>(f.ctx&&r(f.ctx[t],f.ctx[t]=o)&&(f.bound[t]&&f.bound[t](o),p&&I(e,t)),n)):[],f.update(),p=!0,o(f.before_update),f.fragment=!!l&&l(f.ctx),s.target&&(s.hydrate?f.fragment&&f.fragment.l((h=s.target,Array.from(h.childNodes))):f.fragment&&f.fragment.c(),s.intro&&M(e.$$.fragment),S(e,s.target,s.anchor),w()),m(u)}class N{$destroy(){D(this,1),this.$destroy=t}$on(t,e){const n=this.$$.callbacks[t]||(this.$$.callbacks[t]=[]);return n.push(e),()=>{const t=n.indexOf(e);-1!==t&&n.splice(t,1)}}$set(){}}function O(e){let n,s,c,u,g,m,h;return{c(){n=i("div"),s=i("div"),c=i("div"),u=i("input"),g=d(),(m=i("span")).textContent="추가",p(u,"id","msg"),p(u,"type","text"),p(u,"class","form-control"),p(u,"name","msg"),p(u,"placeholder","할일을 여기에 입력!"),u.value=e[0],p(m,"class","btn btn-primary input-group-addon"),p(c,"class","input-group"),p(s,"class","col"),p(n,"class","row"),h=[f(u,"change",e[2]),f(m,"click",e[1])]},m(t,e){r(t,n,e),l(n,s),l(s,c),l(c,u),l(c,g),l(c,m)},p(t,[e]){1&e&&(u.value=t[0])},i:t,o:t,d(t){t&&a(n),o(h)}}}function j(t,e,n){let{callbacks:o}=e,s="";return t.$set=(t=>{"callbacks"in t&&n(3,o=t.callbacks)}),[s,()=>{o.addTodo(s),n(0,s="")},t=>{n(0,s=t.target.value)},o]}class B extends N{constructor(t){super(),L(this,t,j,O,c,{callbacks:3})}}function q(t){let e;return{c(){e=u("(완료)")},m(t,n){r(t,e,n)},d(t){t&&a(e)}}}function H(e){let n,s,c,g,m,h,$,b,k=e[0].todo+"",y=e[0].done&&q();return{c(){n=i("li"),s=i("span"),c=u(k),g=d(),y&&y.c(),h=d(),($=i("span")).textContent="삭제",p(s,"class",m=e[0].done?"todo-done pointer":"pointer"),p($,"class","pull-right badge pointer"),p(n,"class",e[1]),b=[f(s,"click",e[2]),f($,"click",e[3])]},m(t,e){r(t,n,e),l(n,s),l(s,c),l(s,g),y&&y.m(s,null),l(n,h),l(n,$)},p(t,[e]){var o,l;1&e&&k!==(k=t[0].todo+"")&&(l=""+(l=k),(o=c).data!==l&&(o.data=l)),t[0].done?y||((y=q()).c(),y.m(s,null)):y&&(y.d(1),y=null),1&e&&m!==(m=t[0].done?"todo-done pointer":"pointer")&&p(s,"class",m),2&e&&p(n,"class",t[1])},i:t,o:t,d(t){t&&a(n),y&&y.d(),o(b)}}}function P(t,e,n){let{item:o}=e,{callbacks:s}=e;let c;return t.$set=(t=>{"item"in t&&n(0,o=t.item),"callbacks"in t&&n(4,s=t.callbacks)}),t.$$.update=(()=>{1&t.$$.dirty&&n(1,c=o.done?"list-group-item list-group-item-success":"list-group-item")}),[o,c,()=>{s.toggleDone(o.no)},()=>{s.deleteTodo(o.no)},s]}class z extends N{constructor(t){super(),L(this,t,P,H,c,{item:0,callbacks:4})}}function F(t,e,n){const o=t.slice();return o[2]=e[n],o}function G(t,e){let n,o;const s=new z({props:{item:e[2],callbacks:e[1]}});return{key:t,first:null,c(){n=u(""),R(s.$$.fragment),this.first=n},m(t,e){r(t,n,e),S(s,t,e),o=!0},p(t,e){const n={};1&e&&(n.item=t[2]),2&e&&(n.callbacks=t[1]),s.$set(n)},i(t){o||(M(s.$$.fragment,t),o=!0)},o(t){A(s.$$.fragment,t),o=!1},d(t){t&&a(n),D(s,t)}}}function J(t){let e,n,s,c=[],u=new Map,d=t[0].todolist;const f=t=>t[2].no;for(let e=0;e<d.length;e+=1){let n=F(t,d,e),o=f(n);u.set(o,c[e]=G(o,n))}return{c(){e=i("div"),n=i("ul");for(let t=0;t<c.length;t+=1)c[t].c();p(n,"class","list-group"),p(e,"class","row")},m(t,o){r(t,e,o),l(e,n);for(let t=0;t<c.length;t+=1)c[t].m(n,null);s=!0},p(t,[e]){const s=t[0].todolist;E={r:0,c:[],p:E},c=function(t,e,n,o,s,c,l,r,a,i,u,d){let f=t.length,p=c.length,g=f;const m={};for(;g--;)m[t[g].key]=g;const h=[],$=new Map,b=new Map;for(g=p;g--;){const t=d(s,c,g),r=n(t);let a=l.get(r);a?o&&a.p(t,e):(a=i(r,t)).c(),$.set(r,h[g]=a),r in m&&b.set(r,Math.abs(g-m[r]))}const k=new Set,y=new Set;function x(t){M(t,1),t.m(r,u),l.set(t.key,t),u=t.first,p--}for(;f&&p;){const e=h[p-1],n=t[f-1],o=e.key,s=n.key;e===n?(u=e.first,f--,p--):$.has(s)?!l.has(o)||k.has(o)?x(e):y.has(s)?f--:b.get(o)>b.get(s)?(y.add(o),x(e)):(k.add(s),f--):(a(n,l),f--)}for(;f--;){const e=t[f];$.has(e.key)||a(e,l)}for(;p;)x(h[p-1]);return h}(c,e,f,1,t,s,u,n,C,G,null,F),E.r||o(E.c),E=E.p},i(t){if(!s){for(let t=0;t<d.length;t+=1)M(c[t]);s=!0}},o(t){for(let t=0;t<c.length;t+=1)A(c[t]);s=!1},d(t){t&&a(e);for(let t=0;t<c.length;t+=1)c[t].d()}}}function K(t,e,n){let{state:o}=e,{callbacks:s}=e;return t.$set=(t=>{"state"in t&&n(0,o=t.state),"callbacks"in t&&n(1,s=t.callbacks)}),[o,s]}class Q extends N{constructor(t){super(),L(this,t,K,J,c,{state:0,callbacks:1})}}function U(t){let e,n,o,s,c,u,f,g,m;const h=new B({props:{callbacks:t[1]}}),$=new Q({props:{state:t[0],callbacks:t[1]}});return{c(){e=i("div"),(n=i("div")).innerHTML='<div class="title">:: Todolist App</div>',o=d(),s=i("div"),c=i("div"),R(h.$$.fragment),u=d(),f=i("br"),g=d(),R($.$$.fragment),p(n,"class","well"),p(c,"class","panel-body"),p(s,"class","panel panel-borderless"),p(e,"class","container")},m(t,a){r(t,e,a),l(e,n),l(e,o),l(e,s),l(s,c),S(h,c,null),l(c,u),l(c,f),l(c,g),S($,c,null),m=!0},p(t,[e]){const n={};2&e&&(n.callbacks=t[1]),h.$set(n);const o={};1&e&&(o.state=t[0]),2&e&&(o.callbacks=t[1]),$.$set(o)},i(t){m||(M(h.$$.fragment,t),M($.$$.fragment,t),m=!0)},o(t){A(h.$$.fragment,t),A($.$$.fragment,t),m=!1},d(t){t&&a(e),D(h),D($)}}}function V(t,e,n){let{state:o}=e,{callbacks:s}=e;return t.$set=(t=>{"state"in t&&n(0,o=t.state),"callbacks"in t&&n(1,s=t.callbacks)}),[o,s]}class W extends N{constructor(t){super(),L(this,t,V,U,c,{state:0,callbacks:1})}}const X=[];const Y=function(e,n=t){let o;const s=[];function l(t){if(c(e,t)&&(e=t,o)){const t=!X.length;for(let t=0;t<s.length;t+=1){const n=s[t];n[1](),X.push(n,e)}if(t){for(let t=0;t<X.length;t+=2)X[t][0](X[t+1]);X.length=0}}}return{set:l,update:function(t){l(t(e))},subscribe:function(c,r=t){const a=[c,r];return s.push(a),1===s.length&&(o=n(l)||t),c(e),()=>{const t=s.indexOf(a);-1!==t&&s.splice(t,1),0===s.length&&(o(),o=null)}}}}({todolist:[{no:1,todo:"React학습1",done:!1},{no:2,todo:"React학습2",done:!1},{no:3,todo:"React학습3",done:!0},{no:4,todo:"React학습4",done:!1}]});let Z=t=>{Y.update(e=>(e.todolist.push({no:(new Date).getTime(),todo:t,done:!1}),e))},tt=t=>{Y.update(e=>{let n=e.todolist.findIndex(e=>e.no===t);return e.todolist.splice(n,1),e})},et=t=>{Y.update(e=>{let n=e.todolist.findIndex(e=>e.no===t);return e.todolist[n].done=!e.todolist[n].done,e})};function nt(t){let e,n,o;const s=new W({props:{state:t[0],callbacks:t[1]}});return{c(){e=i("link"),n=d(),R(s.$$.fragment),p(e,"rel","stylesheet"),p(e,"href","https://unpkg.com/bootstrap@3/dist/css/bootstrap.min.css")},m(t,c){l(document.head,e),r(t,n,c),S(s,t,c),o=!0},p(t,[e]){const n={};1&e&&(n.state=t[0]),s.$set(n)},i(t){o||(M(s.$$.fragment,t),o=!0)},o(t){A(s.$$.fragment,t),o=!1},d(t){a(e),t&&a(n),D(s,t)}}}function ot(t,e,n){let o;Y.subscribe(t=>{n(0,o=t)});return[o,{addTodo:Z,deleteTodo:tt,toggleDone:et}]}return new class extends N{constructor(t){super(),L(this,t,ot,nt,c,{})}}({target:document.getElementById("root")})}();
//# sourceMappingURL=bundle.js.map
