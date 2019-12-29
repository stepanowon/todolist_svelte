import { writable } from 'svelte/store';

const state = writable({
    todoitem: { no:"", todo:"", desc:"", done:false },
    todolist : [
        { no:1, todo:"React학습1", done:false },
        { no:2, todo:"React학습2", done:false },
        { no:3, todo:"React학습3", done:true },
        { no:4, todo:"React학습4", done:false },
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

let initializeTodoItem = (todoitem) => {
    state.update((draft)=> {
        if (todoitem) {
            draft.todoitem = { ...todoitem };
        } else {
            draft.todoitem = { no:"", todo:"", done:false };
        } 
        return draft;
    })
}

export { state,  addTodo, updateTodo, deleteTodo, toggleDone, initializeTodoItem };

