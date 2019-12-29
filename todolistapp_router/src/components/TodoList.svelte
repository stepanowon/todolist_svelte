<script>
import TodoItem from './TodoItem.svelte'
import { navigateTo } from 'svelte-router-spa'
import { state, initializeTodoItem, deleteTodo, toggleDone } from '../stores/todoStore'

let callbacks = { deleteTodo, toggleDone, initializeTodoItem };

let goAddTodo = () => {
    initializeTodoItem()
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
    <button class="btn btn-primary" on:click={goAddTodo}>연락처 추가</button>
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