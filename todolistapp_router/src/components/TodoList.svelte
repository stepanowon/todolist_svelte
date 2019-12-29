<script>
import TodoItem from './TodoItem.svelte'
import { navigateTo } from 'svelte-router-spa'
import { state, deleteTodo, toggleDone } from '../stores/todoStore'

let callbacks = { deleteTodo, toggleDone };

let goAddTodo = () => {
    navigateTo('add')
}
</script>

<style>

</style>

<div class="container">
    <div class="well">
        <div class="title">
            :: Todolist App
        </div>
    </div>
    <button class="btn btn-primary" on:click={goAddTodo}>Add Todo</button>
    <div class="panel panel-default panel-borderless">
    <div class="panel-body">
        <div class="row">
        {#each $state.todolist as item (item.no)}
            <TodoItem item={item} callbacks={callbacks} />
        {/each}
        </div>
    </div>
    </div>
</div>