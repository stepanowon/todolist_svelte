<script>
import {push} from 'svelte-spa-router'
import { state, addTodo } from '../stores/todoStore';
import { fade } from 'svelte/transition';

let todoitem = { no:"", todo:"", desc:"", done:false };

const addTodoHandler = () => {
    addTodo(todoitem);
    push('/');
}

const cancelHandler = () => {
    push('/');
}

</script>

<div  in:fade="{{duration: 300}}" class="centered-modal fade in" tabindex="-1" role="dialog" aria-labelledby="myLargeModalLabel">
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