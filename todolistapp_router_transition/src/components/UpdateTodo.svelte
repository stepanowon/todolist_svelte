<script>
import {push} from 'svelte-spa-router'
import { state, updateTodo } from '../stores/todoStore';
import { fade } from 'svelte/transition';

export let params = {}

let todoitem = $state.todolist.find((item)=>item.no === parseInt(params.no,10));

if (!todoitem)   push('/');

const updateTodoHandler = () => {
  updateTodo(todoitem);
  push('/');
}

const cancelHandler = () => {
  push('/')
}
</script>

<div  in:fade="{{duration: 500}}" class="centered-modal fade in" tabindex="0" role="dialog">
  <div class="modal-dialog modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal" aria-label="Close" on:click={cancelHandler}><span aria-hidden="true">&times;</span></button>
        <h4 class="modal-title">Edit a Todo</h4>
      </div>
      <div class="modal-body">
        No : 
        <input id="no" type="text" class="form-control" name="no" disabled bind:value={todoitem.no}><br/>
        Todo : 
        <input id="todo" type="text" class="form-control" name="msg" 
            placeholder="Type todo here" bind:value={todoitem.todo}><br/>
        Description : 
        <textarea class="form-control" rows="3" bind:value={todoitem.desc}></textarea>
        Done : <input type="checkbox" bind:checked={todoitem.done} />          
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" on:click={updateTodoHandler}>Update</button>
        <button type="button" class="btn btn-primary" data-dismiss="modal" on:click={cancelHandler}>Cancel</button>
      </div>
    </div>
  </div>
</div>