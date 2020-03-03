var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (!store || typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, callback) {
        const unsub = store.subscribe(callback);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe,
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => store.subscribe((value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    function regexparam (str, loose) {
    	if (str instanceof RegExp) return { keys:false, pattern:str };
    	var c, o, tmp, ext, keys=[], pattern='', arr = str.split('/');
    	arr[0] || arr.shift();

    	while (tmp = arr.shift()) {
    		c = tmp[0];
    		if (c === '*') {
    			keys.push('wild');
    			pattern += '/(.*)';
    		} else if (c === ':') {
    			o = tmp.indexOf('?', 1);
    			ext = tmp.indexOf('.', 1);
    			keys.push( tmp.substring(1, !!~o ? o : !!~ext ? ext : tmp.length) );
    			pattern += !!~o && !~ext ? '(?:/([^/]+?))?' : '/([^/]+?)';
    			if (!!~ext) pattern += (!!~o ? '?' : '') + '\\' + tmp.substring(ext);
    		} else {
    			pattern += '/' + tmp;
    		}
    	}

    	return {
    		keys: keys,
    		pattern: new RegExp('^' + pattern + (loose ? '(?=$|\/)' : '\/?$'), 'i')
    	};
    }

    /* node_modules\svelte-spa-router\Router.svelte generated by Svelte v3.16.5 */

    const { Error: Error_1, Object: Object_1 } = globals;

    function create_fragment(ctx) {
    	let switch_instance_anchor;
    	let current;
    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		return {
    			props: { params: /*componentParams*/ ctx[1] },
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		var switch_instance = new switch_value(switch_props(ctx));
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const switch_instance_changes = {};
    			if (dirty & /*componentParams*/ 2) switch_instance_changes.params = /*componentParams*/ ctx[1];

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props(ctx));
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function getLocation() {
    	const hashPosition = window.location.href.indexOf("#/");

    	let location = hashPosition > -1
    	? window.location.href.substr(hashPosition + 1)
    	: "/";

    	const qsPosition = location.indexOf("?");
    	let querystring = "";

    	if (qsPosition > -1) {
    		querystring = location.substr(qsPosition + 1);
    		location = location.substr(0, qsPosition);
    	}

    	return { location, querystring };
    }

    const loc = readable(getLocation(), function start(set) {
    	const update = () => {
    		set(getLocation());
    	};

    	window.addEventListener("hashchange", update, false);

    	return function stop() {
    		window.removeEventListener("hashchange", update, false);
    	};
    });

    const location = derived(loc, $loc => $loc.location);
    const querystring = derived(loc, $loc => $loc.querystring);

    function push(location) {
    	if (!location || location.length < 1 || location.charAt(0) != "/" && location.indexOf("#/") !== 0) {
    		throw Error("Invalid parameter location");
    	}

    	setTimeout(
    		() => {
    			window.location.hash = (location.charAt(0) == "#" ? "" : "#") + location;
    		},
    		0
    	);
    }

    function instance($$self, $$props, $$invalidate) {
    	let $loc,
    		$$unsubscribe_loc = noop;

    	validate_store(loc, "loc");
    	component_subscribe($$self, loc, $$value => $$invalidate(4, $loc = $$value));
    	$$self.$$.on_destroy.push(() => $$unsubscribe_loc());
    	let { routes = {} } = $$props;
    	let { prefix = "" } = $$props;

    	class RouteItem {
    		constructor(path, component) {
    			if (!component || typeof component != "function" && (typeof component != "object" || component._sveltesparouter !== true)) {
    				throw Error("Invalid component object");
    			}

    			if (!path || typeof path == "string" && (path.length < 1 || path.charAt(0) != "/" && path.charAt(0) != "*") || typeof path == "object" && !(path instanceof RegExp)) {
    				throw Error("Invalid value for \"path\" argument");
    			}

    			const { pattern, keys } = regexparam(path);
    			this.path = path;

    			if (typeof component == "object" && component._sveltesparouter === true) {
    				this.component = component.route;
    				this.conditions = component.conditions || [];
    				this.userData = component.userData;
    			} else {
    				this.component = component;
    				this.conditions = [];
    				this.userData = undefined;
    			}

    			this._pattern = pattern;
    			this._keys = keys;
    		}

    		match(path) {
    			if (prefix && path.startsWith(prefix)) {
    				path = path.substr(prefix.length) || "/";
    			}

    			const matches = this._pattern.exec(path);

    			if (matches === null) {
    				return null;
    			}

    			if (this._keys === false) {
    				return matches;
    			}

    			const out = {};
    			let i = 0;

    			while (i < this._keys.length) {
    				out[this._keys[i]] = matches[++i] || null;
    			}

    			return out;
    		}

    		checkConditions(detail) {
    			for (let i = 0; i < this.conditions.length; i++) {
    				if (!this.conditions[i](detail)) {
    					return false;
    				}
    			}

    			return true;
    		}
    	}

    	const routesIterable = routes instanceof Map ? routes : Object.entries(routes);
    	const routesList = [];

    	for (const [path, route] of routesIterable) {
    		routesList.push(new RouteItem(path, route));
    	}

    	let component = null;
    	let componentParams = {};
    	const dispatch = createEventDispatcher();

    	const dispatchNextTick = (name, detail) => {
    		setTimeout(
    			() => {
    				dispatch(name, detail);
    			},
    			0
    		);
    	};

    	const writable_props = ["routes", "prefix"];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Router> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("routes" in $$props) $$invalidate(2, routes = $$props.routes);
    		if ("prefix" in $$props) $$invalidate(3, prefix = $$props.prefix);
    	};

    	$$self.$capture_state = () => {
    		return {
    			routes,
    			prefix,
    			component,
    			componentParams,
    			$loc
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("routes" in $$props) $$invalidate(2, routes = $$props.routes);
    		if ("prefix" in $$props) $$invalidate(3, prefix = $$props.prefix);
    		if ("component" in $$props) $$invalidate(0, component = $$props.component);
    		if ("componentParams" in $$props) $$invalidate(1, componentParams = $$props.componentParams);
    		if ("$loc" in $$props) loc.set($loc = $$props.$loc);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*component, $loc*/ 17) {
    			 {
    				$$invalidate(0, component = null);
    				let i = 0;

    				while (!component && i < routesList.length) {
    					const match = routesList[i].match($loc.location);

    					if (match) {
    						const detail = {
    							component: routesList[i].component,
    							name: routesList[i].component.name,
    							location: $loc.location,
    							querystring: $loc.querystring,
    							userData: routesList[i].userData
    						};

    						if (!routesList[i].checkConditions(detail)) {
    							dispatchNextTick("conditionsFailed", detail);
    							break;
    						}

    						$$invalidate(0, component = routesList[i].component);
    						$$invalidate(1, componentParams = match);
    						dispatchNextTick("routeLoaded", detail);
    					}

    					i++;
    				}
    			}
    		}
    	};

    	return [component, componentParams, routes, prefix];
    }

    class Router extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { routes: 2, prefix: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Router",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get routes() {
    		throw new Error_1("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set routes(value) {
    		throw new Error_1("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get prefix() {
    		throw new Error_1("<Router>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set prefix(value) {
    		throw new Error_1("<Router>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const todoStore = writable({
      todolist: [
        {
          no: 1,
          todo: "Buy Laptop Computer",
          desc: "Macbook 16 inch(A-shop)",
          done: false
        },
        {
          no: 2,
          todo: "Study ES6",
          desc: "especially about Spread Operator and Arrow Function",
          done: false
        },
        {
          no: 3,
          todo: "Study Vue 3",
          desc: "about Composition API, Vuex and Vue-router",
          done: true
        },
        {
          no: 4,
          todo: "Study React",
          desc: "about Hook, Redux and Context API",
          done: false
        }
      ]
    });

    let addTodo = todoitem => {
      todoStore.update(draft => {
        draft.todolist.push({ ...todoitem, no: new Date().getTime() });
        return draft;
      });
    };

    let deleteTodo = no => {
      todoStore.update(draft => {
        let index = draft.todolist.findIndex(item => item.no === no);
        draft.todolist.splice(index, 1);
        return draft;
      });
    };

    let toggleDone = no => {
      todoStore.update(draft => {
        let index = draft.todolist.findIndex(item => item.no === no);
        draft.todolist[index].done = !draft.todolist[index].done;
        return draft;
      });
    };

    let updateTodo = todoitem => {
      todoStore.update(draft => {
        let index = draft.todolist.findIndex(item => item.no === todoitem.no);
        draft.todolist[index] = { ...todoitem };
        return draft;
      });
    };

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }

    /* src\components\AddTodo.svelte generated by Svelte v3.16.5 */
    const file = "src\\components\\AddTodo.svelte";

    function create_fragment$1(ctx) {
    	let div5;
    	let div4;
    	let div3;
    	let div0;
    	let button0;
    	let span;
    	let t1;
    	let h4;
    	let t3;
    	let div1;
    	let t4;
    	let input;
    	let br;
    	let t5;
    	let textarea;
    	let t6;
    	let div2;
    	let button1;
    	let t8;
    	let button2;
    	let div5_intro;
    	let dispose;

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			span = element("span");
    			span.textContent = "×";
    			t1 = space();
    			h4 = element("h4");
    			h4.textContent = "Add Todo!!";
    			t3 = space();
    			div1 = element("div");
    			t4 = text("Todo : \r\n        ");
    			input = element("input");
    			br = element("br");
    			t5 = text("\r\n        Description : \r\n        ");
    			textarea = element("textarea");
    			t6 = space();
    			div2 = element("div");
    			button1 = element("button");
    			button1.textContent = "Add";
    			t8 = space();
    			button2 = element("button");
    			button2.textContent = "Cancel";
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file, 21, 109, 762);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file, 21, 8, 661);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file, 22, 8, 820);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file, 20, 6, 625);
    			attr_dev(input, "id", "msg");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "form-control");
    			attr_dev(input, "name", "msg");
    			attr_dev(input, "placeholder", "Type todo here");
    			add_location(input, file, 26, 8, 932);
    			add_location(br, file, 27, 68, 1062);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file, 29, 8, 1101);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file, 24, 6, 881);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file, 32, 8, 1238);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file, 33, 8, 1332);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file, 31, 6, 1202);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file, 19, 4, 590);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file, 18, 2, 533);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "-1");
    			attr_dev(div5, "role", "dialog");
    			attr_dev(div5, "aria-labelledby", "myLargeModalLabel");
    			add_location(div5, file, 17, 0, 400);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[2], false, false, false),
    				listen_dev(input, "input", /*input_input_handler*/ ctx[3]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[4]),
    				listen_dev(button1, "click", /*addTodoHandler*/ ctx[1], false, false, false),
    				listen_dev(button2, "click", /*cancelHandler*/ ctx[2], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, button0);
    			append_dev(button0, span);
    			append_dev(div0, t1);
    			append_dev(div0, h4);
    			append_dev(div3, t3);
    			append_dev(div3, div1);
    			append_dev(div1, t4);
    			append_dev(div1, input);
    			set_input_value(input, /*todoitem*/ ctx[0].todo);
    			append_dev(div1, br);
    			append_dev(div1, t5);
    			append_dev(div1, textarea);
    			set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			append_dev(div3, t6);
    			append_dev(div3, div2);
    			append_dev(div2, button1);
    			append_dev(div2, t8);
    			append_dev(div2, button2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todoitem*/ 1 && input.value !== /*todoitem*/ ctx[0].todo) {
    				set_input_value(input, /*todoitem*/ ctx[0].todo);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			}
    		},
    		i: function intro(local) {
    			if (!div5_intro) {
    				add_render_callback(() => {
    					div5_intro = create_in_transition(div5, fade, { duration: 300 });
    					div5_intro.start();
    				});
    			}
    		},
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let todoitem = { no: "", todo: "", desc: "", done: false };

    	const addTodoHandler = () => {
    		addTodo(todoitem);
    		push("/");
    	};

    	const cancelHandler = () => {
    		push("/");
    	};

    	function input_input_handler() {
    		todoitem.todo = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function textarea_input_handler() {
    		todoitem.desc = this.value;
    		$$invalidate(0, todoitem);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    	};

    	return [
    		todoitem,
    		addTodoHandler,
    		cancelHandler,
    		input_input_handler,
    		textarea_input_handler
    	];
    }

    class AddTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AddTodo",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src\components\UpdateTodo.svelte generated by Svelte v3.16.5 */
    const file$1 = "src\\components\\UpdateTodo.svelte";

    function create_fragment$2(ctx) {
    	let div5;
    	let div4;
    	let div3;
    	let div0;
    	let button0;
    	let span;
    	let t1;
    	let h4;
    	let t3;
    	let div1;
    	let t4;
    	let input0;
    	let br0;
    	let t5;
    	let input1;
    	let br1;
    	let t6;
    	let textarea;
    	let t7;
    	let input2;
    	let t8;
    	let div2;
    	let button1;
    	let t10;
    	let button2;
    	let div5_intro;
    	let dispose;

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			span = element("span");
    			span.textContent = "×";
    			t1 = space();
    			h4 = element("h4");
    			h4.textContent = "Edit a Todo";
    			t3 = space();
    			div1 = element("div");
    			t4 = text("No : \r\n        ");
    			input0 = element("input");
    			br0 = element("br");
    			t5 = text("\r\n        Todo : \r\n        ");
    			input1 = element("input");
    			br1 = element("br");
    			t6 = text("\r\n        Description : \r\n        ");
    			textarea = element("textarea");
    			t7 = text("\r\n        Done : ");
    			input2 = element("input");
    			t8 = space();
    			div2 = element("div");
    			button1 = element("button");
    			button1.textContent = "Update";
    			t10 = space();
    			button2 = element("button");
    			button2.textContent = "Cancel";
    			attr_dev(span, "aria-hidden", "true");
    			add_location(span, file$1, 27, 109, 808);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file$1, 27, 8, 707);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file$1, 28, 8, 866);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file$1, 26, 6, 671);
    			attr_dev(input0, "id", "no");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "name", "no");
    			input0.disabled = true;
    			add_location(input0, file$1, 32, 8, 977);
    			add_location(br0, file$1, 32, 100, 1069);
    			attr_dev(input1, "id", "todo");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "name", "msg");
    			attr_dev(input1, "placeholder", "Type todo here");
    			add_location(input1, file$1, 34, 8, 1101);
    			add_location(br1, file$1, 35, 68, 1232);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file$1, 37, 8, 1271);
    			attr_dev(input2, "type", "checkbox");
    			add_location(input2, file$1, 38, 15, 1366);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file$1, 30, 6, 928);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file$1, 41, 8, 1488);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file$1, 42, 8, 1588);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file$1, 40, 6, 1452);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file$1, 25, 4, 636);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file$1, 24, 2, 579);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "0");
    			attr_dev(div5, "role", "dialog");
    			add_location(div5, file$1, 23, 0, 483);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[2], false, false, false),
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[5]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[6]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[7]),
    				listen_dev(input2, "change", /*input2_change_handler*/ ctx[8]),
    				listen_dev(button1, "click", /*updateTodoHandler*/ ctx[1], false, false, false),
    				listen_dev(button2, "click", /*cancelHandler*/ ctx[2], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div0);
    			append_dev(div0, button0);
    			append_dev(button0, span);
    			append_dev(div0, t1);
    			append_dev(div0, h4);
    			append_dev(div3, t3);
    			append_dev(div3, div1);
    			append_dev(div1, t4);
    			append_dev(div1, input0);
    			set_input_value(input0, /*todoitem*/ ctx[0].no);
    			append_dev(div1, br0);
    			append_dev(div1, t5);
    			append_dev(div1, input1);
    			set_input_value(input1, /*todoitem*/ ctx[0].todo);
    			append_dev(div1, br1);
    			append_dev(div1, t6);
    			append_dev(div1, textarea);
    			set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			append_dev(div1, t7);
    			append_dev(div1, input2);
    			input2.checked = /*todoitem*/ ctx[0].done;
    			append_dev(div3, t8);
    			append_dev(div3, div2);
    			append_dev(div2, button1);
    			append_dev(div2, t10);
    			append_dev(div2, button2);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todoitem*/ 1 && input0.value !== /*todoitem*/ ctx[0].no) {
    				set_input_value(input0, /*todoitem*/ ctx[0].no);
    			}

    			if (dirty & /*todoitem*/ 1 && input1.value !== /*todoitem*/ ctx[0].todo) {
    				set_input_value(input1, /*todoitem*/ ctx[0].todo);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				set_input_value(textarea, /*todoitem*/ ctx[0].desc);
    			}

    			if (dirty & /*todoitem*/ 1) {
    				input2.checked = /*todoitem*/ ctx[0].done;
    			}
    		},
    		i: function intro(local) {
    			if (!div5_intro) {
    				add_render_callback(() => {
    					div5_intro = create_in_transition(div5, fade, { duration: 500 });
    					div5_intro.start();
    				});
    			}
    		},
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $todoStore;
    	validate_store(todoStore, "todoStore");
    	component_subscribe($$self, todoStore, $$value => $$invalidate(4, $todoStore = $$value));
    	let { params = {} } = $$props;
    	let todoitem = $todoStore.todolist.find(item => item.no === parseInt(params.no, 10));
    	if (!todoitem) push("/");

    	const updateTodoHandler = () => {
    		updateTodo(todoitem);
    		push("/");
    	};

    	const cancelHandler = () => {
    		push("/");
    	};

    	const writable_props = ["params"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<UpdateTodo> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		todoitem.no = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function input1_input_handler() {
    		todoitem.todo = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function textarea_input_handler() {
    		todoitem.desc = this.value;
    		$$invalidate(0, todoitem);
    	}

    	function input2_change_handler() {
    		todoitem.done = this.checked;
    		$$invalidate(0, todoitem);
    	}

    	$$self.$set = $$props => {
    		if ("params" in $$props) $$invalidate(3, params = $$props.params);
    	};

    	$$self.$capture_state = () => {
    		return { params, todoitem, $todoStore };
    	};

    	$$self.$inject_state = $$props => {
    		if ("params" in $$props) $$invalidate(3, params = $$props.params);
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    		if ("$todoStore" in $$props) todoStore.set($todoStore = $$props.$todoStore);
    	};

    	return [
    		todoitem,
    		updateTodoHandler,
    		cancelHandler,
    		params,
    		$todoStore,
    		input0_input_handler,
    		input1_input_handler,
    		textarea_input_handler,
    		input2_change_handler
    	];
    }

    class UpdateTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { params: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "UpdateTodo",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get params() {
    		throw new Error("<UpdateTodo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set params(value) {
    		throw new Error("<UpdateTodo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\TodoItem.svelte generated by Svelte v3.16.5 */
    const file$2 = "src\\components\\TodoItem.svelte";

    // (31:8) {#if item.done}
    function create_if_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("(Completed)");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(31:8) {#if item.done}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let li;
    	let span0;
    	let t0_value = /*item*/ ctx[0].todo + "";
    	let t0;
    	let t1;
    	let span0_class_value;
    	let t2;
    	let span1;
    	let t4;
    	let span2;
    	let li_title_value;
    	let li_intro;
    	let li_outro;
    	let current;
    	let dispose;
    	let if_block = /*item*/ ctx[0].done && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			span0 = element("span");
    			t0 = text(t0_value);
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			span1 = element("span");
    			span1.textContent = "Delete";
    			t4 = space();
    			span2 = element("span");
    			span2.textContent = "Edit";
    			attr_dev(span0, "class", span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer");
    			add_location(span0, file$2, 27, 4, 693);
    			attr_dev(span1, "class", "pull-right badge pointer");
    			add_location(span1, file$2, 34, 4, 890);
    			attr_dev(span2, "class", "pull-right badge pointer");
    			add_location(span2, file$2, 35, 4, 973);
    			attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			attr_dev(li, "title", li_title_value = "description : " + /*item*/ ctx[0].desc);
    			add_location(li, file$2, 26, 0, 557);

    			dispose = [
    				listen_dev(span0, "click", /*toggleHandler*/ ctx[2], false, false, false),
    				listen_dev(span1, "click", /*deleteHandler*/ ctx[3], false, false, false),
    				listen_dev(span2, "click", /*editTodo*/ ctx[4], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, span0);
    			append_dev(span0, t0);
    			append_dev(span0, t1);
    			if (if_block) if_block.m(span0, null);
    			append_dev(li, t2);
    			append_dev(li, span1);
    			append_dev(li, t4);
    			append_dev(li, span2);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*item*/ 1) && t0_value !== (t0_value = /*item*/ ctx[0].todo + "")) set_data_dev(t0, t0_value);

    			if (/*item*/ ctx[0].done) {
    				if (!if_block) {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(span0, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty & /*item*/ 1 && span0_class_value !== (span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer")) {
    				attr_dev(span0, "class", span0_class_value);
    			}

    			if (!current || dirty & /*itemClassName*/ 2) {
    				attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			}

    			if (!current || dirty & /*item*/ 1 && li_title_value !== (li_title_value = "description : " + /*item*/ ctx[0].desc)) {
    				attr_dev(li, "title", li_title_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (li_outro) li_outro.end(1);
    				if (!li_intro) li_intro = create_in_transition(li, fade, { duration: 300 });
    				li_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (li_intro) li_intro.invalidate();
    			li_outro = create_out_transition(li, fly, { x: 100, duration: 300 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block) if_block.d();
    			if (detaching && li_outro) li_outro.end();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { item } = $$props, { callbacks } = $$props;

    	const toggleHandler = () => {
    		callbacks.toggleDone(item.no);
    	};

    	const deleteHandler = () => {
    		callbacks.deleteTodo(item.no);
    	};

    	const editTodo = () => {
    		push(`/update/${item.no}`);
    	};

    	let itemClassName;
    	const writable_props = ["item", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(5, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { item, callbacks, itemClassName };
    	};

    	$$self.$inject_state = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(5, callbacks = $$props.callbacks);
    		if ("itemClassName" in $$props) $$invalidate(1, itemClassName = $$props.itemClassName);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*item*/ 1) {
    			 {
    				$$invalidate(1, itemClassName = item.done
    				? "list-group-item list-group-item-success"
    				: "list-group-item");
    			}
    		}
    	};

    	return [item, itemClassName, toggleHandler, deleteHandler, editTodo, callbacks];
    }

    class TodoItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { item: 0, callbacks: 5 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoItem",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*item*/ ctx[0] === undefined && !("item" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'item'");
    		}

    		if (/*callbacks*/ ctx[5] === undefined && !("callbacks" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'callbacks'");
    		}
    	}

    	get item() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<TodoItem>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<TodoItem>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\TodoCount.svelte generated by Svelte v3.16.5 */
    const file$3 = "src\\components\\TodoCount.svelte";

    function create_fragment$4(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text("Completed Todos Count : ");
    			t1 = text(/*completedTodoCount*/ ctx[0]);
    			attr_dev(div0, "class", "row");
    			add_location(div0, file$3, 11, 1, 343);
    			attr_dev(div1, "class", "panel-body");
    			add_location(div1, file$3, 10, 0, 316);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, t0);
    			append_dev(div0, t1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*completedTodoCount*/ 1) set_data_dev(t1, /*completedTodoCount*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let completedTodoCount;

    	const unsubscribe = todoStore.subscribe(value => {
    		let completedTodoList = value.todolist.filter(item => item.done === true);
    		$$invalidate(0, completedTodoCount = completedTodoList.length);
    	});

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("completedTodoCount" in $$props) $$invalidate(0, completedTodoCount = $$props.completedTodoCount);
    	};

    	return [completedTodoCount];
    }

    class TodoCount extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoCount",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src\components\TodoList.svelte generated by Svelte v3.16.5 */
    const file$4 = "src\\components\\TodoList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (28:8) {#each $todoStore.todolist as item (item.no)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let current;

    	const todoitem = new TodoItem({
    			props: {
    				item: /*item*/ ctx[3],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			create_component(todoitem.$$.fragment);
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);
    			mount_component(todoitem, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const todoitem_changes = {};
    			if (dirty & /*$todoStore*/ 1) todoitem_changes.item = /*item*/ ctx[3];
    			todoitem.$set(todoitem_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(todoitem.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(todoitem.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			destroy_component(todoitem, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(28:8) {#each $todoStore.todolist as item (item.no)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let div6;
    	let div2;
    	let div1;
    	let div0;
    	let t1;
    	let button;
    	let t3;
    	let div5;
    	let div4;
    	let div3;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t4;
    	let div6_intro;
    	let current;
    	let dispose;
    	let each_value = /*$todoStore*/ ctx[0].todolist;
    	const get_key = ctx => /*item*/ ctx[3].no;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const todocount = new TodoCount({ $$inline: true });

    	const block = {
    		c: function create() {
    			div6 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = ":: Todolist App";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Add Todo";
    			t3 = space();
    			div5 = element("div");
    			div4 = element("div");
    			div3 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t4 = space();
    			create_component(todocount.$$.fragment);
    			add_location(div0, file$4, 20, 12, 541);
    			attr_dev(div1, "class", "title");
    			add_location(div1, file$4, 19, 8, 508);
    			attr_dev(div2, "class", "well");
    			add_location(div2, file$4, 18, 4, 480);
    			attr_dev(button, "class", "btn btn-primary");
    			add_location(button, file$4, 23, 4, 601);
    			attr_dev(div3, "class", "row");
    			add_location(div3, file$4, 26, 8, 767);
    			attr_dev(div4, "class", "panel-body");
    			add_location(div4, file$4, 25, 4, 733);
    			attr_dev(div5, "class", "panel panel-default panel-borderless");
    			add_location(div5, file$4, 24, 4, 677);
    			attr_dev(div6, "class", "container");
    			add_location(div6, file$4, 17, 0, 423);
    			dispose = listen_dev(button, "click", /*goAddTodo*/ ctx[2], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div2);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div6, t1);
    			append_dev(div6, button);
    			append_dev(div6, t3);
    			append_dev(div6, div5);
    			append_dev(div5, div4);
    			append_dev(div4, div3);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div3, null);
    			}

    			append_dev(div5, t4);
    			mount_component(todocount, div5, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const each_value = /*$todoStore*/ ctx[0].todolist;
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div3, outro_and_destroy_block, create_each_block, null, get_each_context);
    			check_outros();
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(todocount.$$.fragment, local);

    			if (!div6_intro) {
    				add_render_callback(() => {
    					div6_intro = create_in_transition(div6, fade, { duration: 300 });
    					div6_intro.start();
    				});
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(todocount.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div6);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			destroy_component(todocount);
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let $todoStore;
    	validate_store(todoStore, "todoStore");
    	component_subscribe($$self, todoStore, $$value => $$invalidate(0, $todoStore = $$value));
    	let callbacks = { deleteTodo, toggleDone };

    	let goAddTodo = () => {
    		push("/add");
    	};

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    		if ("goAddTodo" in $$props) $$invalidate(2, goAddTodo = $$props.goAddTodo);
    		if ("$todoStore" in $$props) todoStore.set($todoStore = $$props.$todoStore);
    	};

    	return [$todoStore, callbacks, goAddTodo];
    }

    class TodoList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoList",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    /* src\components\NotFound.svelte generated by Svelte v3.16.5 */
    const file$5 = "src\\components\\NotFound.svelte";

    function create_fragment$6(ctx) {
    	let div2;
    	let div1;
    	let div0;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = "404 - Object Not Found";
    			attr_dev(div0, "class", "title");
    			add_location(div0, file$5, 7, 8, 125);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$5, 6, 4, 97);
    			attr_dev(div2, "class", "container");
    			add_location(div2, file$5, 5, 0, 68);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class NotFound extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "NotFound",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    const routes = {
      '/' : TodoList,
      '/update/:no' : UpdateTodo,
      '/add' : AddTodo,
      '*' : NotFound,
    };

    /* src\AppContainer.svelte generated by Svelte v3.16.5 */
    const file$6 = "src\\AppContainer.svelte";

    function create_fragment$7(ctx) {
    	let div1;
    	let div0;
    	let current;
    	const router = new Router({ props: { routes }, $$inline: true });

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(router.$$.fragment);
    			attr_dev(div0, "class", "container");
    			add_location(div0, file$6, 7, 2, 115);
    			attr_dev(div1, "id", "root");
    			add_location(div1, file$6, 6, 0, 96);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(router, div0, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(router.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(router.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(router);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class AppContainer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AppContainer",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    const app = new AppContainer({
      target: document.getElementById("root")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
