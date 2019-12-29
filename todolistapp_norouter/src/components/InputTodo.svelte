<script>
export let callbacks;
let todo = "";

const addHandler = ()=> {
    callbacks.addTodo(todo);
    todo = "";
}

const changeTodo = (e) => {
    todo = e.target.value;
}
</script>

<style>

</style>

<div class="row">
    <div class="col">
        <div class="input-group">
            <input id="msg" type="text" class="form-control" name="msg" 
                placeholder="Type Todo!!" value={todo} on:change={changeTodo} />
            <span class="btn btn-primary input-group-addon" on:click={addHandler}>Add!!</span>
        </div>
    </div>
</div>