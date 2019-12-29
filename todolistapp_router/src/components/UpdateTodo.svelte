<script>
import { navigateTo } from 'svelte-router-spa'
import { state, updateTodo } from '../stores/todoStore';

let todoitem = { ...$state.todoitem };

const updateTodoHandler = () => {
    updateTodo(todoitem);
    navigateTo('/');
}

const cancelHandler = () => {
    navigateTo('/');
}
</script>

<div class="centered-modal fade in" tabindex="0" role="dialog">
  <div class="modal-dialog modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal" aria-label="Close" on:click={cancelHandler}><span aria-hidden="true">&times;</span></button>
        <h4 class="modal-title">할일 편집, 수정</h4>
      </div>
      <div class="modal-body">
        번호 : 
        <input id="no" type="text" class="form-control" name="no" disabled bind:value={todoitem.no}><br/>
        할일 : 
        <input id="todo" type="text" class="form-control" name="msg" 
            placeholder="할일을 여기에 입력!" bind:value={todoitem.todo}><br/>
        완료 여부 : <input type="checkbox" bind:value={todoitem.done} />          
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" on:click={updateTodoHandler}>수 정</button>
        <button type="button" class="btn btn-primary" data-dismiss="modal" on:click={cancelHandler}>취 소</button>
      </div>
    </div>
  </div>
</div>