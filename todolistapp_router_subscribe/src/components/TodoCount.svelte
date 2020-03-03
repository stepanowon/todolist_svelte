<script>
    import todoStore from "../stores/todoStore.js";
    let completedTodoCount;
    
    const unsubscribe = todoStore.subscribe(value => {
        let completedTodoList = value.todolist.filter(item => item.done === true);
        completedTodoCount = completedTodoList.length;
    });
</script>

<div class="panel-body">
	<div class="row">
		Completed Todos Count : {completedTodoCount}
	</div>
</div>