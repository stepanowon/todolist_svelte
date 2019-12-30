<script>
import { push } from 'svelte-spa-router'

export let item, callbacks;

const toggleHandler = () => {
    callbacks.toggleDone(item.no);
}

const deleteHandler = () => {
    console.log(item.no)
    callbacks.deleteTodo(item.no);
}

const editTodo = () => {
    push(`/update/${item.no}`);
}

let itemClassName;
$: {
    itemClassName = item.done ? "list-group-item list-group-item-success" : "list-group-item"
}
</script>

<li class={itemClassName} title={'description : ' + item.desc}>
    <span class={item.done ? "todo-done pointer": "pointer"}
        on:click={toggleHandler}>
        {item.todo}
        {#if item.done}
             (Done)
        {/if}
    </span>
    <span class="pull-right badge pointer" on:click={deleteHandler}>Delete</span>
    <span class="pull-right badge pointer" on:click={editTodo}>Edit</span>
</li>