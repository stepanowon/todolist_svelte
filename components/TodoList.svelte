<script>
import TodoItem from './TodoItem.svelte';

export let state, callbacks;
</script>

<div class="row">
    <ul class="list-group">
    {#each state.todolist as item}
        <TodoItem item={item} callbacks={callbacks} />
    {/each}
    </ul>
</div>