<script>
import { Router } from 'svelte-router-spa'
import routes from './routes'

</script>

<div id="root">
  <div class="container">
    <Router {routes} />
  </div>
</div>

