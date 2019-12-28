<script>
export let callbacks;
let todo = "";

const addHandler = ()=> {
    callbacks.addTodo(todo);
    todo = "";
}

const changeTodo = (e) => {
    todo = e.target.value;
    console.log(todo)
}
</script>

<style>

</style>

<div class="row">
    <div class="col">
        <div class="input-group">
            <input id="msg" type="text" class="form-control" name="msg" 
                placeholder="할일을 여기에 입력!" value={todo} on:change={changeTodo} />
            <span class="btn btn-primary input-group-addon" on:click={addHandler}>추가</span>
        </div>
    </div>
</div>