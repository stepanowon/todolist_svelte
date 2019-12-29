<script>
import { navigateTo } from 'svelte-router-spa'
import { state, updateTodo } from '../stores/todoStore';

export let currentRoute;

let todoitem = $state.todolist.find((item)=>item.no === parseInt(currentRoute.namedParams.no,10));
console.log(todoitem)

if (!todoitem)   navigateTo('/');

const updateTodoHandler = () => {
  updateTodo(todoitem);
  navigateTo('/');
}

const cancelHandler = () => {
  navigateTo('/')
}
</script>

<div class="centered-modal fade in" tabindex="0" role="dialog">
  <div class="modal-dialog modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal" aria-label="Close" on:click={cancelHandler}><span aria-hidden="true">&times;</span></button>
        <h4 class="modal-title">Edit Todo --> Update</h4>
      </div>
      <div class="modal-body">
        No : 
        <input id="no" type="text" class="form-control" name="no" disabled bind:value={todoitem.no}><br/>
        Todo : 
        <input id="todo" type="text" class="form-control" name="msg" 
            placeholder="type todo!!" bind:value={todoitem.todo}><br/>
        Description : 
        <textarea class="form-control" rows="3" bind:value={todoitem.desc}></textarea>
        Completed : <input type="checkbox" bind:checked={todoitem.done} />          
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" on:click={updateTodoHandler}>수 정</button>
        <button type="button" class="btn btn-primary" data-dismiss="modal" on:click={cancelHandler}>취 소</button>
      </div>
    </div>
  </div>
</div>