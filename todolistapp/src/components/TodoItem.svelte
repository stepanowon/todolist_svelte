<script>
export let item, callbacks;

const toggleHandler = () => {
    callbacks.toggleDone(item.no);
}

const deleteHandler = () => {
    callbacks.deleteTodo(item.no);
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
             (Done)
        {/if}
    </span>
    <span class="pull-right badge pointer" 
        on:click={deleteHandler}>Delete</span>
</li>