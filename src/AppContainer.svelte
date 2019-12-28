<script>
// import "bootstrap/dist/css/bootstrap.css";
import App from "./components/App.svelte";
import produce from 'immer';

let state = {
    todolist : [
        { no:1, todo:"React학습1", done:false },
        { no:2, todo:"React학습2", done:false },
        { no:3, todo:"React학습3", done:true },
        { no:4, todo:"React학습4", done:false },
    ]
}

let addTodo = (todo) => { 
    state = produce(state, (draft)=> {
        draft.todolist.push({ no:new Date().getTime(), todo:todo, done:false });
    })
}

let deleteTodo = (no) => {
    let index = state.todolist.findIndex((item)=>item.no===no);
    state = produce(state, (draft)=> {
        draft.todolist.splice(index, 1);
    })
}

let toggleDone = (no) => {
    let index = state.todolist.findIndex((item)=>item.no===no);
    state = produce(state, (draft)=> {
        draft.todolist[index].done = !draft.todolist[index].done;
    })
}

let callbacks = { addTodo, deleteTodo, toggleDone };

</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/bootstrap@3/dist/css/bootstrap.min.css">
</svelte:head>

<App state={state} callbacks={callbacks} />
