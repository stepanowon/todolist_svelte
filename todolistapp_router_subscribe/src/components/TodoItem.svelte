<script>
    import { push } from "svelte-spa-router";
    import { fade, fly } from "svelte/transition";

    export let item, callbacks;

    const toggleHandler = () => {
      callbacks.toggleDone(item.no);
    };

    const deleteHandler = () => {
      callbacks.deleteTodo(item.no);
    };

    const editTodo = () => {
      push(`/update/${item.no}`);
    };

    let itemClassName;
    $: {
      itemClassName = item.done
        ? "list-group-item list-group-item-success"
        : "list-group-item";
    }
</script>

<li in:fade="{{ duration: 300}}" out:fly="{{ x: 100, duration: 300 }}" class={itemClassName} title={'description : ' + item.desc}>
    <span class={item.done ? "todo-done pointer": "pointer"}
        on:click={toggleHandler}>
        {item.todo}
        {#if item.done}
             (Completed)
        {/if}
    </span>
    <span class="pull-right badge pointer" on:click={deleteHandler}>Delete</span>
    <span class="pull-right badge pointer" on:click={editTodo}>Edit</span>
</li>