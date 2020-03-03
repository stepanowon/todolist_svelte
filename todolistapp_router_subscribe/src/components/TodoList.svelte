<script>
    import TodoItem from "./TodoItem.svelte";
    import TodoCount from "./TodoCount.svelte";
    import { push } from "svelte-spa-router";
    import todoStore, { deleteTodo, toggleDone } from "../stores/todoStore";
    import { fade } from "svelte/transition";

    let callbacks = { deleteTodo, toggleDone };

    let goAddTodo = () => {
      push("/add");
    };
</script>

<style>
</style>

<div  in:fade="{{duration:300}}" class="container">
    <div class="well">
        <div class="title">
            <div>:: Todolist App</div>
        </div>
    </div>
    <button class="btn btn-primary" on:click={goAddTodo}>Add Todo</button>
    <div class="panel panel-default panel-borderless">
    <div class="panel-body">
        <div class="row">
        {#each $todoStore.todolist as item (item.no)}
            <TodoItem item={item} callbacks={callbacks} />
        {/each}
        </div>
    </div>
    <TodoCount />
    </div>
</div>