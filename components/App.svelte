<script>
import InputTodo from './InputTodo.svelte';
import TodoList  from './TodoList.svelte';

export let state, callbacks;
// console.log(state);
</script>


<div class="container">
    <div class="well">
        <div class="title">:: Todolist App</div>
    </div>
    <div class="panel panel-default panel-borderless">
        <div class="panel-body">
            <InputTodo callbacks={callbacks} />
            <TodoList state={state} callbacks={callbacks} />
        </div>
    </div>
</div>
