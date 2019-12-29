<script>
import { navigateTo } from 'svelte-router-spa'
import getTrackedState from '../redux/todoStore'
import todoAction from '../redux/todoAction'

const state = getTrackedState();

let addTodo = (todoitem) => state.dispatch(todoAction.addTodo(todoitem.todo, todoitem.desc));

let todoitem = { todo:"", desc:"" };

const addTodoHandler = () => {
    addTodo(todoitem);
    navigateTo('/');
}

const cancelHandler = () => {
    navigateTo('/');
}

</script>

<div class="centered-modal fade in" tabindex="-1" role="dialog" aria-labelledby="myLargeModalLabel">
  <div class="modal-dialog modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal" aria-label="Close" on:click={cancelHandler}><span aria-hidden="true">&times;</span></button>
        <h4 class="modal-title">Add Todo!!</h4>
      </div>
      <div class="modal-body">
        Todo : 
        <input id="msg" type="text" class="form-control" name="msg" 
            placeholder="Type todo here" bind:value={todoitem.todo}><br/>
        Description : 
        <textarea class="form-control" rows="3" bind:value={todoitem.desc}></textarea> 
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" on:click={addTodoHandler}>Add</button>
        <button type="button" class="btn btn-primary" data-dismiss="modal" on:click={cancelHandler}>Cancel</button>
      </div>
    </div>
  </div>
</div>