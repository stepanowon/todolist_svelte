<script>
import { navigateTo } from 'svelte-router-spa'

export let item, callbacks;

const toggleHandler = () => {
    callbacks.toggleDone(item.no);
}

const deleteHandler = () => {
    callbacks.deleteTodo(item.no);
}

const editTodo = () => {
    callbacks.initializeTodoItem(item);
    navigateTo(`update/${item.no}`);
}

let itemClassName;
$: {
    itemClassName = item.done ? "list-group-item list-group-item-success" : "list-group-item"
}
</script>

<li class={itemClassName}>
    <span class={item.done ? "todo-done pointer": "pointer"}
        on:click={toggleHandler}>
        {item.todo}
        {#if item.done}
             (완료)
        {/if}
    </span>
    <span class="pull-right badge pointer" on:click={deleteHandler}>삭제</span>
    <span class="pull-right badge pointer" on:click={editTodo}>편집</span>
</li>