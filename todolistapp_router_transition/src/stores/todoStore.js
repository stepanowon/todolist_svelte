import { writable } from 'svelte/store';

const state = writable({
    todolist : [
        { no:1, todo:"Buy Laptop Computer", desc:"Macbook 16 inch(A-shop)" , done:false },
        { no:2, todo:"Study ES6", desc:"especially about Spread Operator and Arrow Function", done:false },
        { no:3, todo:"Study Vue 3", desc:"about Composition API, Vuex and Vue-router", done:true },
        { no:4, todo:"Study React", desc:"about Hook, Redux and Context API", done:false },
    ]
})

let addTodo = (todoitem) => { 
    state.update((draft)=> {
        draft.todolist.push({ ...todoitem, no: new Date().getTime() })
        return draft;
    })
}

let deleteTodo = (no) => {
    state.update((draft)=> {
        let index = draft.todolist.findIndex((item)=>item.no===no);
        draft.todolist.splice(index,1);
        return draft;
    })
}

let toggleDone = (no) => {
    state.update((draft)=> {
        let index = draft.todolist.findIndex((item)=>item.no===no);
        draft.todolist[index].done = !draft.todolist[index].done;
        return draft;
    })
}

let updateTodo = (todoitem) => {
    state.update((draft)=> {
        let index = draft.todolist.findIndex((item)=> item.no === todoitem.no);
        draft.todolist[index] = { ...todoitem };
        return draft;
    })
}

export { state,  addTodo, updateTodo, deleteTodo, toggleDone };

