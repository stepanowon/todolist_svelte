import { writable } from 'svelte/store';

const state = writable({
    todolist : [
        { no:1, todo:"Buy Laptop Computer", done:false },
        { no:2, todo:"Study ES6", done:false },
        { no:3, todo:"Study Vue 3", done:true },
        { no:4, todo:"Study React", done:false },
    ]
})

let addTodo = (todo) => { 
    state.update((current)=> {
        current.todolist.push({ no: new Date().getTime(), todo:todo, done:false })
        return current;
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

export { state,  addTodo, deleteTodo, toggleDone };

