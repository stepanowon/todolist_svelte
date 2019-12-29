var app = (function () {
    'use strict';

    function noop() { }
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
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
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
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
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

    /* src\components\InputTodo.svelte generated by Svelte v3.16.5 */

    const file = "src\\components\\InputTodo.svelte";

    function create_fragment(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let input;
    	let t0;
    	let span;
    	let dispose;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			input = element("input");
    			t0 = space();
    			span = element("span");
    			span.textContent = "추가";
    			attr_dev(input, "id", "msg");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "form-control");
    			attr_dev(input, "name", "msg");
    			attr_dev(input, "placeholder", "할일을 여기에 입력!");
    			input.value = /*todo*/ ctx[0];
    			add_location(input, file, 21, 12, 314);
    			attr_dev(span, "class", "btn btn-primary input-group-addon");
    			add_location(span, file, 23, 12, 470);
    			attr_dev(div0, "class", "input-group");
    			add_location(div0, file, 20, 8, 275);
    			attr_dev(div1, "class", "col");
    			add_location(div1, file, 19, 4, 248);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file, 18, 0, 225);

    			dispose = [
    				listen_dev(input, "change", /*changeTodo*/ ctx[2], false, false, false),
    				listen_dev(span, "click", /*addHandler*/ ctx[1], false, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, input);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*todo*/ 1) {
    				prop_dev(input, "value", /*todo*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			run_all(dispose);
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

    function instance($$self, $$props, $$invalidate) {
    	let { callbacks } = $$props;
    	let todo = "";

    	const addHandler = () => {
    		callbacks.addTodo(todo);
    		$$invalidate(0, todo = "");
    	};

    	const changeTodo = e => {
    		$$invalidate(0, todo = e.target.value);
    	};

    	const writable_props = ["callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<InputTodo> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("callbacks" in $$props) $$invalidate(3, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { callbacks, todo };
    	};

    	$$self.$inject_state = $$props => {
    		if ("callbacks" in $$props) $$invalidate(3, callbacks = $$props.callbacks);
    		if ("todo" in $$props) $$invalidate(0, todo = $$props.todo);
    	};

    	return [todo, addHandler, changeTodo, callbacks];
    }

    class InputTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { callbacks: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "InputTodo",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*callbacks*/ ctx[3] === undefined && !("callbacks" in props)) {
    			console.warn("<InputTodo> was created without expected prop 'callbacks'");
    		}
    	}

    	get callbacks() {
    		throw new Error("<InputTodo>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<InputTodo>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\TodoItem.svelte generated by Svelte v3.16.5 */

    const file$1 = "src\\components\\TodoItem.svelte";

    // (22:8) {#if item.done}
    function create_if_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("(완료)");
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
    		source: "(22:8) {#if item.done}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let li;
    	let span0;
    	let t0_value = /*item*/ ctx[0].todo + "";
    	let t0;
    	let t1;
    	let span0_class_value;
    	let t2;
    	let span1;
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
    			span1.textContent = "삭제";
    			attr_dev(span0, "class", span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer");
    			add_location(span0, file$1, 18, 4, 354);
    			attr_dev(span1, "class", "pull-right badge pointer");
    			add_location(span1, file$1, 25, 4, 544);
    			attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			add_location(li, file$1, 17, 0, 322);

    			dispose = [
    				listen_dev(span0, "click", /*toggleHandler*/ ctx[2], false, false, false),
    				listen_dev(span1, "click", /*deleteHandler*/ ctx[3], false, false, false)
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
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*item*/ 1 && t0_value !== (t0_value = /*item*/ ctx[0].todo + "")) set_data_dev(t0, t0_value);

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

    			if (dirty & /*item*/ 1 && span0_class_value !== (span0_class_value = /*item*/ ctx[0].done ? "todo-done pointer" : "pointer")) {
    				attr_dev(span0, "class", span0_class_value);
    			}

    			if (dirty & /*itemClassName*/ 2) {
    				attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if (if_block) if_block.d();
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
    	let { item } = $$props, { callbacks } = $$props;

    	const toggleHandler = () => {
    		callbacks.toggleDone(item.no);
    	};

    	const deleteHandler = () => {
    		callbacks.deleteTodo(item.no);
    	};

    	let itemClassName;
    	const writable_props = ["item", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoItem> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(4, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { item, callbacks, itemClassName };
    	};

    	$$self.$inject_state = $$props => {
    		if ("item" in $$props) $$invalidate(0, item = $$props.item);
    		if ("callbacks" in $$props) $$invalidate(4, callbacks = $$props.callbacks);
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

    	return [item, itemClassName, toggleHandler, deleteHandler, callbacks];
    }

    class TodoItem extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { item: 0, callbacks: 4 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoItem",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*item*/ ctx[0] === undefined && !("item" in props)) {
    			console.warn("<TodoItem> was created without expected prop 'item'");
    		}

    		if (/*callbacks*/ ctx[4] === undefined && !("callbacks" in props)) {
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

    /* src\components\TodoList.svelte generated by Svelte v3.16.5 */
    const file$2 = "src\\components\\TodoList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[2] = list[i];
    	return child_ctx;
    }

    // (9:4) {#each state.todolist as item (item.no)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let current;

    	const todoitem = new TodoItem({
    			props: {
    				item: /*item*/ ctx[2],
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
    			if (dirty & /*state*/ 1) todoitem_changes.item = /*item*/ ctx[2];
    			if (dirty & /*callbacks*/ 2) todoitem_changes.callbacks = /*callbacks*/ ctx[1];
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
    		source: "(9:4) {#each state.todolist as item (item.no)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div;
    	let ul;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = /*state*/ ctx[0].todolist;
    	const get_key = ctx => /*item*/ ctx[2].no;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(ul, "class", "list-group");
    			add_location(ul, file$2, 7, 4, 121);
    			attr_dev(div, "class", "row");
    			add_location(div, file$2, 6, 0, 98);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const each_value = /*state*/ ctx[0].todolist;
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, outro_and_destroy_block, create_each_block, null, get_each_context);
    			check_outros();
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
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
    	let { state } = $$props, { callbacks } = $$props;
    	const writable_props = ["state", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TodoList> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { state, callbacks };
    	};

    	$$self.$inject_state = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [state, callbacks];
    }

    class TodoList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { state: 0, callbacks: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoList",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*state*/ ctx[0] === undefined && !("state" in props)) {
    			console.warn("<TodoList> was created without expected prop 'state'");
    		}

    		if (/*callbacks*/ ctx[1] === undefined && !("callbacks" in props)) {
    			console.warn("<TodoList> was created without expected prop 'callbacks'");
    		}
    	}

    	get state() {
    		throw new Error("<TodoList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<TodoList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<TodoList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<TodoList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\components\App.svelte generated by Svelte v3.16.5 */
    const file$3 = "src\\components\\App.svelte";

    function create_fragment$3(ctx) {
    	let div4;
    	let div1;
    	let div0;
    	let t1;
    	let div3;
    	let div2;
    	let t2;
    	let br;
    	let t3;
    	let current;

    	const inputtodo = new InputTodo({
    			props: { callbacks: /*callbacks*/ ctx[1] },
    			$$inline: true
    		});

    	const todolist = new TodoList({
    			props: {
    				state: /*state*/ ctx[0],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = ":: Todolist App";
    			t1 = space();
    			div3 = element("div");
    			div2 = element("div");
    			create_component(inputtodo.$$.fragment);
    			t2 = space();
    			br = element("br");
    			t3 = space();
    			create_component(todolist.$$.fragment);
    			attr_dev(div0, "class", "title");
    			add_location(div0, file$3, 10, 8, 215);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$3, 9, 4, 188);
    			add_location(br, file$3, 15, 12, 401);
    			attr_dev(div2, "class", "panel-body");
    			add_location(div2, file$3, 13, 8, 316);
    			attr_dev(div3, "class", "panel panel-borderless");
    			add_location(div3, file$3, 12, 4, 271);
    			attr_dev(div4, "class", "container");
    			add_location(div4, file$3, 8, 0, 160);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div1);
    			append_dev(div1, div0);
    			append_dev(div4, t1);
    			append_dev(div4, div3);
    			append_dev(div3, div2);
    			mount_component(inputtodo, div2, null);
    			append_dev(div2, t2);
    			append_dev(div2, br);
    			append_dev(div2, t3);
    			mount_component(todolist, div2, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const inputtodo_changes = {};
    			if (dirty & /*callbacks*/ 2) inputtodo_changes.callbacks = /*callbacks*/ ctx[1];
    			inputtodo.$set(inputtodo_changes);
    			const todolist_changes = {};
    			if (dirty & /*state*/ 1) todolist_changes.state = /*state*/ ctx[0];
    			if (dirty & /*callbacks*/ 2) todolist_changes.callbacks = /*callbacks*/ ctx[1];
    			todolist.$set(todolist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(inputtodo.$$.fragment, local);
    			transition_in(todolist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(inputtodo.$$.fragment, local);
    			transition_out(todolist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			destroy_component(inputtodo);
    			destroy_component(todolist);
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
    	let { state } = $$props, { callbacks } = $$props;
    	const writable_props = ["state", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	$$self.$capture_state = () => {
    		return { state, callbacks };
    	};

    	$$self.$inject_state = $$props => {
    		if ("state" in $$props) $$invalidate(0, state = $$props.state);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [state, callbacks];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { state: 0, callbacks: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (/*state*/ ctx[0] === undefined && !("state" in props)) {
    			console.warn("<App> was created without expected prop 'state'");
    		}

    		if (/*callbacks*/ ctx[1] === undefined && !("callbacks" in props)) {
    			console.warn("<App> was created without expected prop 'callbacks'");
    		}
    	}

    	get state() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set state(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get callbacks() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set callbacks(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const subscriber_queue = [];
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

    const state = writable({
        todolist : [
            { no:1, todo:"React학습1", done:false },
            { no:2, todo:"React학습2", done:false },
            { no:3, todo:"React학습3", done:true },
            { no:4, todo:"React학습4", done:false },
        ]
    });

    let addTodo = (todo) => { 
        state.update((current)=> {
            current.todolist.push({ no: new Date().getTime(), todo:todo, done:false });
            return current;
        });
    };

    let deleteTodo = (no) => {
        state.update((draft)=> {
            let index = draft.todolist.findIndex((item)=>item.no===no);
            draft.todolist.splice(index,1);
            return draft;
        });
    };

    let toggleDone = (no) => {
        state.update((draft)=> {
            let index = draft.todolist.findIndex((item)=>item.no===no);
            draft.todolist[index].done = !draft.todolist[index].done;
            return draft;
        });
    };

    /* src\AppContainer.svelte generated by Svelte v3.16.5 */
    const file$4 = "src\\AppContainer.svelte";

    function create_fragment$4(ctx) {
    	let link;
    	let t;
    	let current;

    	const app = new App({
    			props: {
    				state: /*appState*/ ctx[0],
    				callbacks: /*callbacks*/ ctx[1]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			link = element("link");
    			t = space();
    			create_component(app.$$.fragment);
    			attr_dev(link, "rel", "stylesheet");
    			attr_dev(link, "href", "https://unpkg.com/bootstrap@3/dist/css/bootstrap.min.css");
    			add_location(link, file$4, 15, 2, 358);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			append_dev(document.head, link);
    			insert_dev(target, t, anchor);
    			mount_component(app, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const app_changes = {};
    			if (dirty & /*appState*/ 1) app_changes.state = /*appState*/ ctx[0];
    			app.$set(app_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(app.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(app.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			detach_dev(link);
    			if (detaching) detach_dev(t);
    			destroy_component(app, detaching);
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
    	let appState;

    	const unsubscribe = state.subscribe(value => {
    		$$invalidate(0, appState = value);
    	});

    	let callbacks = { addTodo, deleteTodo, toggleDone };

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("appState" in $$props) $$invalidate(0, appState = $$props.appState);
    		if ("callbacks" in $$props) $$invalidate(1, callbacks = $$props.callbacks);
    	};

    	return [appState, callbacks];
    }

    class AppContainer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AppContainer",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    const app = new AppContainer({
      target: document.getElementById("root")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
