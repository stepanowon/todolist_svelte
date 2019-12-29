import { writable } from 'svelte/store';

const state = writable({
    todolist : [
        { no:1, todo:"React학습1", done:false },
        { no:2, todo:"React학습2", done:false },
        { no:3, todo:"React학습3", done:true },
        { no:4, todo:"React학습4", done:false },
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

