<script>
export let item, callbacks;

const toggleHandler = () => {
    callbacks.toggleDone(item.no);
}

const deleteHandler = () => {
    callbacks.deleteTodo(item.no);
}

let itemClassName;
$: if (item.done) { 
    itemClassName +="list-group-item list-group-item-success";
} else {
    itemClassName +="list-group-item";
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
    <span class="pull-right badge pointer" 
        on:click={deleteHandler}>삭제</span>
</li>