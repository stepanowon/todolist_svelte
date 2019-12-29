<script>
import { navigateTo } from 'svelte-router-spa'
import { state, addTodo } from '../stores/todoStore';

let todoitem = { ...$state.todoitem };

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
        <h4 class="modal-title">할일 추가</h4>
      </div>
      <div class="modal-body">
        할일 : 
        <input id="msg" type="text" class="form-control" name="msg" 
            placeholder="할일을 여기에 입력!" bind:value={todoitem.todo}><br/>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" on:click={addTodoHandler}>추 가</button>
        <button type="button" class="btn btn-primary" data-dismiss="modal" on:click={cancelHandler}>취 소</button>
      </div>
    </div>
  </div>
</div>