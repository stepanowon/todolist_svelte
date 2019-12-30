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

    /** Detect free variable `global` from Node.js. */
    var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

    /** Detect free variable `self`. */
    var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

    /** Used as a reference to the global object. */
    var root = freeGlobal || freeSelf || Function('return this')();

    /** Built-in value references. */
    var Symbol$1 = root.Symbol;

    /** Used for built-in method references. */
    var objectProto = Object.prototype;

    /** Used to check objects for own properties. */
    var hasOwnProperty = objectProto.hasOwnProperty;

    /**
     * Used to resolve the
     * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
     * of values.
     */
    var nativeObjectToString = objectProto.toString;

    /** Built-in value references. */
    var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : undefined;

    /**
     * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
     *
     * @private
     * @param {*} value The value to query.
     * @returns {string} Returns the raw `toStringTag`.
     */
    function getRawTag(value) {
      var isOwn = hasOwnProperty.call(value, symToStringTag),
          tag = value[symToStringTag];

      try {
        value[symToStringTag] = undefined;
        var unmasked = true;
      } catch (e) {}

      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }

    /** Used for built-in method references. */
    var objectProto$1 = Object.prototype;

    /**
     * Used to resolve the
     * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
     * of values.
     */
    var nativeObjectToString$1 = objectProto$1.toString;

    /**
     * Converts `value` to a string using `Object.prototype.toString`.
     *
     * @private
     * @param {*} value The value to convert.
     * @returns {string} Returns the converted string.
     */
    function objectToString(value) {
      return nativeObjectToString$1.call(value);
    }

    /** `Object#toString` result references. */
    var nullTag = '[object Null]',
        undefinedTag = '[object Undefined]';

    /** Built-in value references. */
    var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : undefined;

    /**
     * The base implementation of `getTag` without fallbacks for buggy environments.
     *
     * @private
     * @param {*} value The value to query.
     * @returns {string} Returns the `toStringTag`.
     */
    function baseGetTag(value) {
      if (value == null) {
        return value === undefined ? undefinedTag : nullTag;
      }
      return (symToStringTag$1 && symToStringTag$1 in Object(value))
        ? getRawTag(value)
        : objectToString(value);
    }

    /**
     * Creates a unary function that invokes `func` with its argument transformed.
     *
     * @private
     * @param {Function} func The function to wrap.
     * @param {Function} transform The argument transform.
     * @returns {Function} Returns the new function.
     */
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }

    /** Built-in value references. */
    var getPrototype = overArg(Object.getPrototypeOf, Object);

    /**
     * Checks if `value` is object-like. A value is object-like if it's not `null`
     * and has a `typeof` result of "object".
     *
     * @static
     * @memberOf _
     * @since 4.0.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
     * @example
     *
     * _.isObjectLike({});
     * // => true
     *
     * _.isObjectLike([1, 2, 3]);
     * // => true
     *
     * _.isObjectLike(_.noop);
     * // => false
     *
     * _.isObjectLike(null);
     * // => false
     */
    function isObjectLike(value) {
      return value != null && typeof value == 'object';
    }

    /** `Object#toString` result references. */
    var objectTag = '[object Object]';

    /** Used for built-in method references. */
    var funcProto = Function.prototype,
        objectProto$2 = Object.prototype;

    /** Used to resolve the decompiled source of functions. */
    var funcToString = funcProto.toString;

    /** Used to check objects for own properties. */
    var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

    /** Used to infer the `Object` constructor. */
    var objectCtorString = funcToString.call(Object);

    /**
     * Checks if `value` is a plain object, that is, an object created by the
     * `Object` constructor or one with a `[[Prototype]]` of `null`.
     *
     * @static
     * @memberOf _
     * @since 0.8.0
     * @category Lang
     * @param {*} value The value to check.
     * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
     * @example
     *
     * function Foo() {
     *   this.a = 1;
     * }
     *
     * _.isPlainObject(new Foo);
     * // => false
     *
     * _.isPlainObject([1, 2, 3]);
     * // => false
     *
     * _.isPlainObject({ 'x': 0, 'y': 0 });
     * // => true
     *
     * _.isPlainObject(Object.create(null));
     * // => true
     */
    function isPlainObject(value) {
      if (!isObjectLike(value) || baseGetTag(value) != objectTag) {
        return false;
      }
      var proto = getPrototype(value);
      if (proto === null) {
        return true;
      }
      var Ctor = hasOwnProperty$1.call(proto, 'constructor') && proto.constructor;
      return typeof Ctor == 'function' && Ctor instanceof Ctor &&
        funcToString.call(Ctor) == objectCtorString;
    }

    function symbolObservablePonyfill(root) {
    	var result;
    	var Symbol = root.Symbol;

    	if (typeof Symbol === 'function') {
    		if (Symbol.observable) {
    			result = Symbol.observable;
    		} else {
    			result = Symbol('observable');
    			Symbol.observable = result;
    		}
    	} else {
    		result = '@@observable';
    	}

    	return result;
    }

    /* global window */

    var root$1;

    if (typeof self !== 'undefined') {
      root$1 = self;
    } else if (typeof window !== 'undefined') {
      root$1 = window;
    } else if (typeof global !== 'undefined') {
      root$1 = global;
    } else if (typeof module !== 'undefined') {
      root$1 = module;
    } else {
      root$1 = Function('return this')();
    }

    var result = symbolObservablePonyfill(root$1);

    /**
     * These are private action types reserved by Redux.
     * For any unknown actions, you must return the current state.
     * If the current state is undefined, you must return the initial state.
     * Do not reference these action types directly in your code.
     */
    var ActionTypes = {
      INIT: '@@redux/INIT'

      /**
       * Creates a Redux store that holds the state tree.
       * The only way to change the data in the store is to call `dispatch()` on it.
       *
       * There should only be a single store in your app. To specify how different
       * parts of the state tree respond to actions, you may combine several reducers
       * into a single reducer function by using `combineReducers`.
       *
       * @param {Function} reducer A function that returns the next state tree, given
       * the current state tree and the action to handle.
       *
       * @param {any} [preloadedState] The initial state. You may optionally specify it
       * to hydrate the state from the server in universal apps, or to restore a
       * previously serialized user session.
       * If you use `combineReducers` to produce the root reducer function, this must be
       * an object with the same shape as `combineReducers` keys.
       *
       * @param {Function} [enhancer] The store enhancer. You may optionally specify it
       * to enhance the store with third-party capabilities such as middleware,
       * time travel, persistence, etc. The only store enhancer that ships with Redux
       * is `applyMiddleware()`.
       *
       * @returns {Store} A Redux store that lets you read the state, dispatch actions
       * and subscribe to changes.
       */
    };function createStore(reducer, preloadedState, enhancer) {
      var _ref2;

      if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
        enhancer = preloadedState;
        preloadedState = undefined;
      }

      if (typeof enhancer !== 'undefined') {
        if (typeof enhancer !== 'function') {
          throw new Error('Expected the enhancer to be a function.');
        }

        return enhancer(createStore)(reducer, preloadedState);
      }

      if (typeof reducer !== 'function') {
        throw new Error('Expected the reducer to be a function.');
      }

      var currentReducer = reducer;
      var currentState = preloadedState;
      var currentListeners = [];
      var nextListeners = currentListeners;
      var isDispatching = false;

      function ensureCanMutateNextListeners() {
        if (nextListeners === currentListeners) {
          nextListeners = currentListeners.slice();
        }
      }

      /**
       * Reads the state tree managed by the store.
       *
       * @returns {any} The current state tree of your application.
       */
      function getState() {
        return currentState;
      }

      /**
       * Adds a change listener. It will be called any time an action is dispatched,
       * and some part of the state tree may potentially have changed. You may then
       * call `getState()` to read the current state tree inside the callback.
       *
       * You may call `dispatch()` from a change listener, with the following
       * caveats:
       *
       * 1. The subscriptions are snapshotted just before every `dispatch()` call.
       * If you subscribe or unsubscribe while the listeners are being invoked, this
       * will not have any effect on the `dispatch()` that is currently in progress.
       * However, the next `dispatch()` call, whether nested or not, will use a more
       * recent snapshot of the subscription list.
       *
       * 2. The listener should not expect to see all state changes, as the state
       * might have been updated multiple times during a nested `dispatch()` before
       * the listener is called. It is, however, guaranteed that all subscribers
       * registered before the `dispatch()` started will be called with the latest
       * state by the time it exits.
       *
       * @param {Function} listener A callback to be invoked on every dispatch.
       * @returns {Function} A function to remove this change listener.
       */
      function subscribe(listener) {
        if (typeof listener !== 'function') {
          throw new Error('Expected listener to be a function.');
        }

        var isSubscribed = true;

        ensureCanMutateNextListeners();
        nextListeners.push(listener);

        return function unsubscribe() {
          if (!isSubscribed) {
            return;
          }

          isSubscribed = false;

          ensureCanMutateNextListeners();
          var index = nextListeners.indexOf(listener);
          nextListeners.splice(index, 1);
        };
      }

      /**
       * Dispatches an action. It is the only way to trigger a state change.
       *
       * The `reducer` function, used to create the store, will be called with the
       * current state tree and the given `action`. Its return value will
       * be considered the **next** state of the tree, and the change listeners
       * will be notified.
       *
       * The base implementation only supports plain object actions. If you want to
       * dispatch a Promise, an Observable, a thunk, or something else, you need to
       * wrap your store creating function into the corresponding middleware. For
       * example, see the documentation for the `redux-thunk` package. Even the
       * middleware will eventually dispatch plain object actions using this method.
       *
       * @param {Object} action A plain object representing “what changed”. It is
       * a good idea to keep actions serializable so you can record and replay user
       * sessions, or use the time travelling `redux-devtools`. An action must have
       * a `type` property which may not be `undefined`. It is a good idea to use
       * string constants for action types.
       *
       * @returns {Object} For convenience, the same action object you dispatched.
       *
       * Note that, if you use a custom middleware, it may wrap `dispatch()` to
       * return something else (for example, a Promise you can await).
       */
      function dispatch(action) {
        if (!isPlainObject(action)) {
          throw new Error('Actions must be plain objects. ' + 'Use custom middleware for async actions.');
        }

        if (typeof action.type === 'undefined') {
          throw new Error('Actions may not have an undefined "type" property. ' + 'Have you misspelled a constant?');
        }

        if (isDispatching) {
          throw new Error('Reducers may not dispatch actions.');
        }

        try {
          isDispatching = true;
          currentState = currentReducer(currentState, action);
        } finally {
          isDispatching = false;
        }

        var listeners = currentListeners = nextListeners;
        for (var i = 0; i < listeners.length; i++) {
          var listener = listeners[i];
          listener();
        }

        return action;
      }

      /**
       * Replaces the reducer currently used by the store to calculate the state.
       *
       * You might need this if your app implements code splitting and you want to
       * load some of the reducers dynamically. You might also need this if you
       * implement a hot reloading mechanism for Redux.
       *
       * @param {Function} nextReducer The reducer for the store to use instead.
       * @returns {void}
       */
      function replaceReducer(nextReducer) {
        if (typeof nextReducer !== 'function') {
          throw new Error('Expected the nextReducer to be a function.');
        }

        currentReducer = nextReducer;
        dispatch({ type: ActionTypes.INIT });
      }

      /**
       * Interoperability point for observable/reactive libraries.
       * @returns {observable} A minimal observable of state changes.
       * For more information, see the observable proposal:
       * https://github.com/tc39/proposal-observable
       */
      function observable() {
        var _ref;

        var outerSubscribe = subscribe;
        return _ref = {
          /**
           * The minimal observable subscription method.
           * @param {Object} observer Any object that can be used as an observer.
           * The observer object should have a `next` method.
           * @returns {subscription} An object with an `unsubscribe` method that can
           * be used to unsubscribe the observable from the store, and prevent further
           * emission of values from the observable.
           */
          subscribe: function subscribe(observer) {
            if (typeof observer !== 'object') {
              throw new TypeError('Expected the observer to be an object.');
            }

            function observeState() {
              if (observer.next) {
                observer.next(getState());
              }
            }

            observeState();
            var unsubscribe = outerSubscribe(observeState);
            return { unsubscribe: unsubscribe };
          }
        }, _ref[result] = function () {
          return this;
        }, _ref;
      }

      // When a store is created, an "INIT" action is dispatched so that every
      // reducer returns their initial state. This effectively populates
      // the initial state tree.
      dispatch({ type: ActionTypes.INIT });

      return _ref2 = {
        dispatch: dispatch,
        subscribe: subscribe,
        getState: getState,
        replaceReducer: replaceReducer
      }, _ref2[result] = observable, _ref2;
    }

    /**
     * Prints a warning in the console if it exists.
     *
     * @param {String} message The warning message.
     * @returns {void}
     */
    function warning(message) {
      /* eslint-disable no-console */
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error(message);
      }
      /* eslint-enable no-console */
      try {
        // This error was thrown as a convenience so that if you enable
        // "break on all exceptions" in your console,
        // it would pause the execution at this line.
        throw new Error(message);
        /* eslint-disable no-empty */
      } catch (e) {}
      /* eslint-enable no-empty */
    }

    function getUndefinedStateErrorMessage(key, action) {
      var actionType = action && action.type;
      var actionName = actionType && '"' + actionType.toString() + '"' || 'an action';

      return 'Given action ' + actionName + ', reducer "' + key + '" returned undefined. ' + 'To ignore an action, you must explicitly return the previous state. ' + 'If you want this reducer to hold no value, you can return null instead of undefined.';
    }

    function getUnexpectedStateShapeWarningMessage(inputState, reducers, action, unexpectedKeyCache) {
      var reducerKeys = Object.keys(reducers);
      var argumentName = action && action.type === ActionTypes.INIT ? 'preloadedState argument passed to createStore' : 'previous state received by the reducer';

      if (reducerKeys.length === 0) {
        return 'Store does not have a valid reducer. Make sure the argument passed ' + 'to combineReducers is an object whose values are reducers.';
      }

      if (!isPlainObject(inputState)) {
        return 'The ' + argumentName + ' has unexpected type of "' + {}.toString.call(inputState).match(/\s([a-z|A-Z]+)/)[1] + '". Expected argument to be an object with the following ' + ('keys: "' + reducerKeys.join('", "') + '"');
      }

      var unexpectedKeys = Object.keys(inputState).filter(function (key) {
        return !reducers.hasOwnProperty(key) && !unexpectedKeyCache[key];
      });

      unexpectedKeys.forEach(function (key) {
        unexpectedKeyCache[key] = true;
      });

      if (unexpectedKeys.length > 0) {
        return 'Unexpected ' + (unexpectedKeys.length > 1 ? 'keys' : 'key') + ' ' + ('"' + unexpectedKeys.join('", "') + '" found in ' + argumentName + '. ') + 'Expected to find one of the known reducer keys instead: ' + ('"' + reducerKeys.join('", "') + '". Unexpected keys will be ignored.');
      }
    }

    function assertReducerShape(reducers) {
      Object.keys(reducers).forEach(function (key) {
        var reducer = reducers[key];
        var initialState = reducer(undefined, { type: ActionTypes.INIT });

        if (typeof initialState === 'undefined') {
          throw new Error('Reducer "' + key + '" returned undefined during initialization. ' + 'If the state passed to the reducer is undefined, you must ' + 'explicitly return the initial state. The initial state may ' + 'not be undefined. If you don\'t want to set a value for this reducer, ' + 'you can use null instead of undefined.');
        }

        var type = '@@redux/PROBE_UNKNOWN_ACTION_' + Math.random().toString(36).substring(7).split('').join('.');
        if (typeof reducer(undefined, { type: type }) === 'undefined') {
          throw new Error('Reducer "' + key + '" returned undefined when probed with a random type. ' + ('Don\'t try to handle ' + ActionTypes.INIT + ' or other actions in "redux/*" ') + 'namespace. They are considered private. Instead, you must return the ' + 'current state for any unknown actions, unless it is undefined, ' + 'in which case you must return the initial state, regardless of the ' + 'action type. The initial state may not be undefined, but can be null.');
        }
      });
    }

    /**
     * Turns an object whose values are different reducer functions, into a single
     * reducer function. It will call every child reducer, and gather their results
     * into a single state object, whose keys correspond to the keys of the passed
     * reducer functions.
     *
     * @param {Object} reducers An object whose values correspond to different
     * reducer functions that need to be combined into one. One handy way to obtain
     * it is to use ES6 `import * as reducers` syntax. The reducers may never return
     * undefined for any action. Instead, they should return their initial state
     * if the state passed to them was undefined, and the current state for any
     * unrecognized action.
     *
     * @returns {Function} A reducer function that invokes every reducer inside the
     * passed object, and builds a state object with the same shape.
     */
    function combineReducers(reducers) {
      var reducerKeys = Object.keys(reducers);
      var finalReducers = {};
      for (var i = 0; i < reducerKeys.length; i++) {
        var key = reducerKeys[i];

        {
          if (typeof reducers[key] === 'undefined') {
            warning('No reducer provided for key "' + key + '"');
          }
        }

        if (typeof reducers[key] === 'function') {
          finalReducers[key] = reducers[key];
        }
      }
      var finalReducerKeys = Object.keys(finalReducers);

      var unexpectedKeyCache = void 0;
      {
        unexpectedKeyCache = {};
      }

      var shapeAssertionError = void 0;
      try {
        assertReducerShape(finalReducers);
      } catch (e) {
        shapeAssertionError = e;
      }

      return function combination() {
        var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var action = arguments[1];

        if (shapeAssertionError) {
          throw shapeAssertionError;
        }

        {
          var warningMessage = getUnexpectedStateShapeWarningMessage(state, finalReducers, action, unexpectedKeyCache);
          if (warningMessage) {
            warning(warningMessage);
          }
        }

        var hasChanged = false;
        var nextState = {};
        for (var _i = 0; _i < finalReducerKeys.length; _i++) {
          var _key = finalReducerKeys[_i];
          var reducer = finalReducers[_key];
          var previousStateForKey = state[_key];
          var nextStateForKey = reducer(previousStateForKey, action);
          if (typeof nextStateForKey === 'undefined') {
            var errorMessage = getUndefinedStateErrorMessage(_key, action);
            throw new Error(errorMessage);
          }
          nextState[_key] = nextStateForKey;
          hasChanged = hasChanged || nextStateForKey !== previousStateForKey;
        }
        return hasChanged ? nextState : state;
      };
    }

    function bindActionCreator(actionCreator, dispatch) {
      return function () {
        return dispatch(actionCreator.apply(undefined, arguments));
      };
    }

    /**
     * Turns an object whose values are action creators, into an object with the
     * same keys, but with every function wrapped into a `dispatch` call so they
     * may be invoked directly. This is just a convenience method, as you can call
     * `store.dispatch(MyActionCreators.doSomething())` yourself just fine.
     *
     * For convenience, you can also pass a single function as the first argument,
     * and get a function in return.
     *
     * @param {Function|Object} actionCreators An object whose values are action
     * creator functions. One handy way to obtain it is to use ES6 `import * as`
     * syntax. You may also pass a single function.
     *
     * @param {Function} dispatch The `dispatch` function available on your Redux
     * store.
     *
     * @returns {Function|Object} The object mimicking the original object, but with
     * every action creator wrapped into the `dispatch` call. If you passed a
     * function as `actionCreators`, the return value will also be a single
     * function.
     */
    function bindActionCreators(actionCreators, dispatch) {
      if (typeof actionCreators === 'function') {
        return bindActionCreator(actionCreators, dispatch);
      }

      if (typeof actionCreators !== 'object' || actionCreators === null) {
        throw new Error('bindActionCreators expected an object or a function, instead received ' + (actionCreators === null ? 'null' : typeof actionCreators) + '. ' + 'Did you write "import ActionCreators from" instead of "import * as ActionCreators from"?');
      }

      var keys = Object.keys(actionCreators);
      var boundActionCreators = {};
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var actionCreator = actionCreators[key];
        if (typeof actionCreator === 'function') {
          boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
        }
      }
      return boundActionCreators;
    }

    /**
     * Composes single-argument functions from right to left. The rightmost
     * function can take multiple arguments as it provides the signature for
     * the resulting composite function.
     *
     * @param {...Function} funcs The functions to compose.
     * @returns {Function} A function obtained by composing the argument functions
     * from right to left. For example, compose(f, g, h) is identical to doing
     * (...args) => f(g(h(...args))).
     */

    function compose() {
      for (var _len = arguments.length, funcs = Array(_len), _key = 0; _key < _len; _key++) {
        funcs[_key] = arguments[_key];
      }

      if (funcs.length === 0) {
        return function (arg) {
          return arg;
        };
      }

      if (funcs.length === 1) {
        return funcs[0];
      }

      return funcs.reduce(function (a, b) {
        return function () {
          return a(b.apply(undefined, arguments));
        };
      });
    }

    var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

    /**
     * Creates a store enhancer that applies middleware to the dispatch method
     * of the Redux store. This is handy for a variety of tasks, such as expressing
     * asynchronous actions in a concise manner, or logging every action payload.
     *
     * See `redux-thunk` package as an example of the Redux middleware.
     *
     * Because middleware is potentially asynchronous, this should be the first
     * store enhancer in the composition chain.
     *
     * Note that each middleware will be given the `dispatch` and `getState` functions
     * as named arguments.
     *
     * @param {...Function} middlewares The middleware chain to be applied.
     * @returns {Function} A store enhancer applying the middleware.
     */
    function applyMiddleware() {
      for (var _len = arguments.length, middlewares = Array(_len), _key = 0; _key < _len; _key++) {
        middlewares[_key] = arguments[_key];
      }

      return function (createStore) {
        return function (reducer, preloadedState, enhancer) {
          var store = createStore(reducer, preloadedState, enhancer);
          var _dispatch = store.dispatch;
          var chain = [];

          var middlewareAPI = {
            getState: store.getState,
            dispatch: function dispatch(action) {
              return _dispatch(action);
            }
          };
          chain = middlewares.map(function (middleware) {
            return middleware(middlewareAPI);
          });
          _dispatch = compose.apply(undefined, chain)(store.dispatch);

          return _extends({}, store, {
            dispatch: _dispatch
          });
        };
      };
    }

    /*
    * This is a dummy function to check if the function name has been altered by minification.
    * If the function has been minified and NODE_ENV !== 'production', warn the user.
    */
    function isCrushed() {}

    if ( typeof isCrushed.name === 'string' && isCrushed.name !== 'isCrushed') {
      warning('You are currently using minified code outside of NODE_ENV === \'production\'. ' + 'This means that you are running a slower development build of Redux. ' + 'You can use loose-envify (https://github.com/zertosh/loose-envify) for browserify ' + 'or DefinePlugin for webpack (http://stackoverflow.com/questions/30030031) ' + 'to ensure you have the correct code for your production build.');
    }

    var es = /*#__PURE__*/Object.freeze({
        __proto__: null,
        createStore: createStore,
        combineReducers: combineReducers,
        bindActionCreators: bindActionCreators,
        applyMiddleware: applyMiddleware,
        compose: compose
    });

    var r=Symbol("OWN_KEYS"),n=function(e,t,a){if(!function(e){try{var t=Object.getPrototypeOf(e);return t===Object.prototype||t===Array.prototype}catch(e){return !1}}(e))return e;var i=a&&a.get(e);return i||((i={recordUsage:function(e){var t=this.affected.get(this.originalObj);t||(t=new Set,this.affected.set(this.originalObj,t)),t.add(e);},get:function(e,t){return this.recordUsage(t),n(e[t],this.affected,this.proxyCache)},has:function(e,t){return this.recordUsage(t),t in e},ownKeys:function(e){return this.recordUsage(r),Reflect.ownKeys(e)}}).proxy=new Proxy(function(e){return Object.isFrozen(e)?Array.isArray(e)?Array.from(e):Object.assign({},e):e}(e),i),i.originalObj=e,a&&a.set(e,i)),i.affected=t,i.proxyCache=a,i.proxy},a=function(e,t){var r=Reflect.ownKeys(e),n=Reflect.ownKeys(t);return r.length!==n.length||r.some((function(e,t){return e!==n[t]}))},i=function(t){var i,o=new WeakMap,c=function(e){var t=new WeakMap,r=n(e,t,o);return i={state:e,affected:t,cache:new WeakMap},r},f=c(t.getState());return {subscribe:readable(f,(function(e){return t.subscribe((function(){var n=t.getState();i.state!==n&&function e(t,n,i,o,c){if(t===n)return !1;if("object"!=typeof t||null===t)return !0;if("object"!=typeof n||null===n)return !0;var f=i.get(t);if(!f)return !!c;if(o){var s=o.get(t);if(s&&s.nextObj===n)return s.changed;o.set(t,{nextObj:n});}var u=null,b=f,h=Array.isArray(b),y=0;for(b=h?b:b[Symbol.iterator]();;){var g;if(h){if(y>=b.length)break;g=b[y++];}else{if((y=b.next()).done)break;g=y.value;}var l=g,p=l===r?a(t,n):e(t[l],n[l],i,o,!1!==c);if("boolean"==typeof p&&(u=p),u)break}return null===u&&(u=!!c),o&&o.set(t,{nextObj:n,changed:u}),u}(i.state,n,i.affected,i.cache)&&e(c(n));}))})).subscribe,dispatch:t.dispatch}};//# sourceMappingURL=index.esm.js.map

    var Constant = {
        ADD_TODO : "addTodo",
        DELETE_TODO : "deleteTodo",
        TOGGLE_DONE : "toggleDone",
        UPDATE_TODO : "updateTodo",
    };

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation. All rights reserved.
    Licensed under the Apache License, Version 2.0 (the "License"); you may not use
    this file except in compliance with the License. You may obtain a copy of the
    License at http://www.apache.org/licenses/LICENSE-2.0

    THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
    WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
    MERCHANTABLITY OR NON-INFRINGEMENT.

    See the Apache Version 2.0 License for specific language governing permissions
    and limitations under the License.
    ***************************************************************************** */

    function __spreadArrays() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    }

    var _a;
    /**
     * The sentinel value returned by producers to replace the draft with undefined.
     */

    var NOTHING = typeof Symbol !== "undefined" ? Symbol("immer-nothing") : (_a = {}, _a["immer-nothing"] = true, _a);
    /**
     * To let Immer treat your class instances as plain immutable objects
     * (albeit with a custom prototype), you must define either an instance property
     * or a static property on each of your custom classes.
     *
     * Otherwise, your class instance will never be drafted, which means it won't be
     * safe to mutate in a produce callback.
     */

    var DRAFTABLE = typeof Symbol !== "undefined" && Symbol["for"] ? Symbol["for"]("immer-draftable") : "__$immer_draftable";
    var DRAFT_STATE = typeof Symbol !== "undefined" && Symbol["for"] ? Symbol["for"]("immer-state") : "__$immer_state";
    /** Returns true if the given value is an Immer draft */

    function isDraft(value) {
      return !!value && !!value[DRAFT_STATE];
    }
    /** Returns true if the given value can be drafted by Immer */

    function isDraftable(value) {
      if (!value) { return false; }
      return isPlainObject$1(value) || !!value[DRAFTABLE] || !!value.constructor[DRAFTABLE] || isMap(value) || isSet(value);
    }
    function isPlainObject$1(value) {
      if (!value || typeof value !== "object") { return false; }
      if (Array.isArray(value)) { return true; }
      var proto = Object.getPrototypeOf(value);
      return !proto || proto === Object.prototype;
    }
    /** Get the underlying object that is represented by the given draft */

    function original(value) {
      if (value && value[DRAFT_STATE]) {
        return value[DRAFT_STATE].base;
      } // otherwise return undefined

    } // We use Maps as `drafts` for Sets, not Objects
    // See proxy.js

    function assignSet(target, override) {
      override.forEach(function (value) {
        // When we add new drafts we have to remove their originals if present
        var prev = original(value);
        if (prev) { target["delete"](prev); } // @ts-ignore TODO investigate

        target.add(value);
      });
      return target;
    } // We use Maps as `drafts` for Maps, not Objects
    // See proxy.js

    function assignMap(target, override) {
      override.forEach(function (value, key) {
        return target.set(key, value);
      });
      return target;
    }
    var assign = Object.assign || function (target) {
      var arguments$1 = arguments;

      var overrides = [];

      for (var _i = 1; _i < arguments.length; _i++) {
        overrides[_i - 1] = arguments$1[_i];
      }

      overrides.forEach(function (override) {
        if (typeof override === "object" && override !== null) { Object.keys(override).forEach(function (key) {
          return target[key] = override[key];
        }); }
      });
      return target;
    };
    var ownKeys = typeof Reflect !== "undefined" && Reflect.ownKeys ? Reflect.ownKeys : typeof Object.getOwnPropertySymbols !== "undefined" ? function (obj) {
      return Object.getOwnPropertyNames(obj).concat(Object.getOwnPropertySymbols(obj));
    } : Object.getOwnPropertyNames;
    function shallowCopy(base, invokeGetters) {
      if (invokeGetters === void 0) {
        invokeGetters = false;
      }

      if (Array.isArray(base)) { return base.slice(); }
      if (isMap(base)) { return new Map(base); }
      if (isSet(base)) { return new Set(base); }
      var clone = Object.create(Object.getPrototypeOf(base));
      ownKeys(base).forEach(function (key) {
        if (key === DRAFT_STATE) {
          return; // Never copy over draft state.
        }

        var desc = Object.getOwnPropertyDescriptor(base, key);
        var value = desc.value;

        if (desc.get) {
          if (!invokeGetters) {
            throw new Error("Immer drafts cannot have computed properties");
          }

          value = desc.get.call(base);
        }

        if (desc.enumerable) {
          clone[key] = value;
        } else {
          Object.defineProperty(clone, key, {
            value: value,
            writable: true,
            configurable: true
          });
        }
      });
      return clone;
    }
    function each(obj, iter) {
      if (Array.isArray(obj) || isMap(obj) || isSet(obj)) {
        obj.forEach(function (entry, index) {
          return iter(index, entry, obj);
        });
      } else {
        ownKeys(obj).forEach(function (key) {
          return iter(key, obj[key], obj);
        });
      }
    }
    function isEnumerable(base, prop) {
      var desc = Object.getOwnPropertyDescriptor(base, prop);
      return desc && desc.enumerable ? true : false;
    }
    function has(thing, prop) {
      return isMap(thing) ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
    }
    function get(thing, prop) {
      return isMap(thing) ? thing.get(prop) : thing[prop];
    }
    function is(x, y) {
      // From: https://github.com/facebook/fbjs/blob/c69904a511b900266935168223063dd8772dfc40/packages/fbjs/src/core/shallowEqual.js
      if (x === y) {
        return x !== 0 || 1 / x === 1 / y;
      } else {
        return x !== x && y !== y;
      }
    }
    var hasSymbol = typeof Symbol !== "undefined";
    var hasMap = typeof Map !== "undefined";
    function isMap(target) {
      return hasMap && target instanceof Map;
    }
    var hasSet = typeof Set !== "undefined";
    function isSet(target) {
      return hasSet && target instanceof Set;
    }
    function makeIterable(next) {
      var _a;

      var self;
      return self = (_a = {}, _a[Symbol.iterator] = function () {
        return self;
      }, _a.next = next, _a);
    }
    /** Map.prototype.values _-or-_ Map.prototype.entries */

    function iterateMapValues(state, prop, receiver) {
      var isEntries = prop !== "values";
      return function () {
        var iterator = latest(state)[Symbol.iterator]();
        return makeIterable(function () {
          var result = iterator.next();

          if (!result.done) {
            var key = result.value[0];
            var value = receiver.get(key);
            result.value = isEntries ? [key, value] : value;
          }

          return result;
        });
      };
    }
    function makeIterateSetValues(createProxy) {
      function iterateSetValues(state, prop) {
        var isEntries = prop === "entries";
        return function () {
          var iterator = latest(state)[Symbol.iterator]();
          return makeIterable(function () {
            var result = iterator.next();

            if (!result.done) {
              var value = wrapSetValue(state, result.value);
              result.value = isEntries ? [value, value] : value;
            }

            return result;
          });
        };
      }

      function wrapSetValue(state, value) {
        var key = original(value) || value;
        var draft = state.drafts.get(key);

        if (!draft) {
          if (state.finalized || !isDraftable(value) || state.finalizing) {
            return value;
          }

          draft = createProxy(value, state);
          state.drafts.set(key, draft);

          if (state.modified) {
            state.copy.add(draft);
          }
        }

        return draft;
      }

      return iterateSetValues;
    }

    function latest(state) {
      return state.copy || state.base;
    }

    function clone(obj) {
      if (!isDraftable(obj)) { return obj; }
      if (Array.isArray(obj)) { return obj.map(clone); }
      if (isMap(obj)) { return new Map(obj); }
      if (isSet(obj)) { return new Set(obj); }
      var cloned = Object.create(Object.getPrototypeOf(obj));

      for (var key in obj) { cloned[key] = clone(obj[key]); }

      return cloned;
    }
    function freeze(obj, deep) {
      if (deep === void 0) {
        deep = false;
      }

      if (!isDraftable(obj) || isDraft(obj) || Object.isFrozen(obj)) { return; }

      if (isSet(obj)) {
        obj.add = obj.clear = obj["delete"] = dontMutateFrozenCollections;
      } else if (isMap(obj)) {
        obj.set = obj.clear = obj["delete"] = dontMutateFrozenCollections;
      }

      Object.freeze(obj);
      if (deep) { each(obj, function (_, value) {
        return freeze(value, true);
      }); }
    }

    function dontMutateFrozenCollections() {
      throw new Error("This object has been frozen and should not be mutated");
    }

    /** Each scope represents a `produce` call. */

    var ImmerScope =
    /** @class */
    function () {
      function ImmerScope(parent) {
        this.drafts = [];
        this.parent = parent; // Whenever the modified draft contains a draft from another scope, we
        // need to prevent auto-freezing so the unowned draft can be finalized.

        this.canAutoFreeze = true; // To avoid prototype lookups:

        this.patches = null; // TODO:
      }

      ImmerScope.prototype.usePatches = function (patchListener) {
        if (patchListener) {
          this.patches = [];
          this.inversePatches = [];
          this.patchListener = patchListener;
        }
      };

      ImmerScope.prototype.revoke = function () {
        this.leave();
        this.drafts.forEach(revoke); // @ts-ignore

        this.drafts = null; // TODO: // Make draft-related methods throw.
      };

      ImmerScope.prototype.leave = function () {
        if (this === ImmerScope.current) {
          ImmerScope.current = this.parent;
        }
      };

      ImmerScope.enter = function () {
        var scope = new ImmerScope(ImmerScope.current);
        ImmerScope.current = scope;
        return scope;
      };

      return ImmerScope;
    }();

    function revoke(draft) {
      draft[DRAFT_STATE].revoke();
    }

    function willFinalize(scope, result, isReplaced) {
      scope.drafts.forEach(function (draft) {
        draft[DRAFT_STATE].finalizing = true;
      });

      if (!isReplaced) {
        if (scope.patches) {
          markChangesRecursively(scope.drafts[0]);
        } // This is faster when we don't care about which attributes changed.


        markChangesSweep(scope.drafts);
      } // When a child draft is returned, look for changes.
      else if (isDraft(result) && result[DRAFT_STATE].scope === scope) {
          markChangesSweep(scope.drafts);
        }
    }
    function createProxy(base, parent) {
      var isArray = Array.isArray(base);
      var draft = clonePotentialDraft(base);

      if (isMap(base)) {
        proxyMap(draft);
      } else if (isSet(base)) {
        proxySet(draft);
      } else {
        each(draft, function (prop) {
          proxyProperty(draft, prop, isArray || isEnumerable(base, prop));
        });
      } // See "proxy.js" for property documentation.


      var scope = parent ? parent.scope : ImmerScope.current;
      var state = {
        scope: scope,
        modified: false,
        finalizing: false,
        finalized: false,
        assigned: isMap(base) ? new Map() : {},
        parent: parent,
        base: base,
        draft: draft,
        drafts: isSet(base) ? new Map() : null,
        copy: null,
        revoke: revoke$1,
        revoked: false // es5 only

      };
      createHiddenProperty(draft, DRAFT_STATE, state);
      scope.drafts.push(draft);
      return draft;
    }

    function revoke$1() {
      this.revoked = true;
    }

    function latest$1(state) {
      return state.copy || state.base;
    } // Access a property without creating an Immer draft.


    function peek(draft, prop) {
      var state = draft[DRAFT_STATE];

      if (state && !state.finalizing) {
        state.finalizing = true;
        var value = draft[prop];
        state.finalizing = false;
        return value;
      }

      return draft[prop];
    }

    function get$1(state, prop) {
      assertUnrevoked(state);
      var value = peek(latest$1(state), prop);
      if (state.finalizing) { return value; } // Create a draft if the value is unmodified.

      if (value === peek(state.base, prop) && isDraftable(value)) {
        prepareCopy(state);
        return state.copy[prop] = createProxy(value, state);
      }

      return value;
    }

    function set(state, prop, value) {
      assertUnrevoked(state);
      state.assigned[prop] = true;

      if (!state.modified) {
        if (is(value, peek(latest$1(state), prop))) { return; }
        markChanged(state);
        prepareCopy(state);
      }

      state.copy[prop] = value;
    }

    function markChanged(state) {
      if (!state.modified) {
        state.modified = true;
        if (state.parent) { markChanged(state.parent); }
      }
    }

    function prepareCopy(state) {
      if (!state.copy) { state.copy = clonePotentialDraft(state.base); }
    }

    function clonePotentialDraft(base) {
      var state = base && base[DRAFT_STATE];

      if (state) {
        state.finalizing = true;
        var draft = shallowCopy(state.draft, true);
        state.finalizing = false;
        return draft;
      }

      return shallowCopy(base);
    } // property descriptors are recycled to make sure we don't create a get and set closure per property,
    // but share them all instead


    var descriptors = {};

    function proxyProperty(draft, prop, enumerable) {
      var desc = descriptors[prop];

      if (desc) {
        desc.enumerable = enumerable;
      } else {
        descriptors[prop] = desc = {
          configurable: true,
          enumerable: enumerable,
          get: function () {
            return get$1(this[DRAFT_STATE], prop);
          },
          set: function (value) {
            set(this[DRAFT_STATE], prop, value);
          }
        };
      }

      Object.defineProperty(draft, prop, desc);
    }

    function proxyMap(target) {
      Object.defineProperties(target, mapTraps);

      if (hasSymbol) {
        Object.defineProperty(target, Symbol.iterator, // @ts-ignore
        proxyMethod(iterateMapValues) //TODO: , Symbol.iterator)
        );
      }
    }

    var mapTraps = finalizeTraps({
      size: function (state) {
        return latest$1(state).size;
      },
      has: function (state) {
        return function (key) {
          return latest$1(state).has(key);
        };
      },
      set: function (state) {
        return function (key, value) {
          if (latest$1(state).get(key) !== value) {
            prepareCopy(state);
            markChanged(state);
            state.assigned.set(key, true);
            state.copy.set(key, value);
          }

          return state.draft;
        };
      },
      "delete": function (state) {
        return function (key) {
          prepareCopy(state);
          markChanged(state);
          state.assigned.set(key, false);
          state.copy["delete"](key);
          return false;
        };
      },
      clear: function (state) {
        return function () {
          if (!state.copy) {
            prepareCopy(state);
          }

          markChanged(state);
          state.assigned = new Map();

          for (var _i = 0, _a = latest$1(state).keys(); _i < _a.length; _i++) {
            var key = _a[_i];
            state.assigned.set(key, false);
          }

          return state.copy.clear();
        };
      },
      forEach: function (state, key, reciever) {
        return function (cb) {
          latest$1(state).forEach(function (value, key, map) {
            cb(reciever.get(key), key, map);
          });
        };
      },
      get: function (state) {
        return function (key) {
          var value = latest$1(state).get(key);

          if (state.finalizing || state.finalized || !isDraftable(value)) {
            return value;
          }

          if (value !== state.base.get(key)) {
            return value;
          }

          var draft = createProxy(value, state);
          prepareCopy(state);
          state.copy.set(key, draft);
          return draft;
        };
      },
      keys: function (state) {
        return function () {
          return latest$1(state).keys();
        };
      },
      values: iterateMapValues,
      entries: iterateMapValues
    });

    function proxySet(target) {
      Object.defineProperties(target, setTraps);

      if (hasSymbol) {
        Object.defineProperty(target, Symbol.iterator, // @ts-ignore
        proxyMethod(iterateSetValues) //TODO: , Symbol.iterator)
        );
      }
    }

    var iterateSetValues = makeIterateSetValues(createProxy);
    var setTraps = finalizeTraps({
      size: function (state) {
        return latest$1(state).size;
      },
      add: function (state) {
        return function (value) {
          if (!latest$1(state).has(value)) {
            markChanged(state);

            if (!state.copy) {
              prepareCopy(state);
            }

            state.copy.add(value);
          }

          return state.draft;
        };
      },
      "delete": function (state) {
        return function (value) {
          markChanged(state);

          if (!state.copy) {
            prepareCopy(state);
          }

          return state.copy["delete"](value);
        };
      },
      has: function (state) {
        return function (key) {
          return latest$1(state).has(key);
        };
      },
      clear: function (state) {
        return function () {
          markChanged(state);

          if (!state.copy) {
            prepareCopy(state);
          }

          return state.copy.clear();
        };
      },
      keys: iterateSetValues,
      entries: iterateSetValues,
      values: iterateSetValues,
      forEach: function (state) {
        return function (cb, thisArg) {
          var iterator = iterateSetValues(state)();
          var result = iterator.next();

          while (!result.done) {
            cb.call(thisArg, result.value, result.value, state.draft);
            result = iterator.next();
          }
        };
      }
    });

    function finalizeTraps(traps) {
      return Object.keys(traps).reduce(function (acc, key) {
        var builder = key === "size" ? proxyAttr : proxyMethod;
        acc[key] = builder(traps[key], key);
        return acc;
      }, {});
    }

    function proxyAttr(fn) {
      return {
        get: function () {
          var state = this[DRAFT_STATE];
          assertUnrevoked(state);
          return fn(state);
        }
      };
    }

    function proxyMethod(trap, key) {
      return {
        get: function () {
          return function () {
            var arguments$1 = arguments;

            var args = [];

            for (var _i = 0; _i < arguments.length; _i++) {
              args[_i] = arguments$1[_i];
            }

            var state = this[DRAFT_STATE];
            assertUnrevoked(state);
            return trap(state, key, state.draft).apply(void 0, args);
          };
        }
      };
    }

    function assertUnrevoked(state) {
      if (state.revoked === true) { throw new Error("Cannot use a proxy that has been revoked. Did you pass an object from inside an immer function to an async process? " + JSON.stringify(latest$1(state))); }
    } // This looks expensive, but only proxies are visited, and only objects without known changes are scanned.


    function markChangesSweep(drafts) {
      // The natural order of drafts in the `scope` array is based on when they
      // were accessed. By processing drafts in reverse natural order, we have a
      // better chance of processing leaf nodes first. When a leaf node is known to
      // have changed, we can avoid any traversal of its ancestor nodes.
      for (var i = drafts.length - 1; i >= 0; i--) {
        var state = drafts[i][DRAFT_STATE];

        if (!state.modified) {
          if (Array.isArray(state.base)) {
            if (hasArrayChanges(state)) { markChanged(state); }
          } else if (isMap(state.base)) {
            if (hasMapChanges(state)) { markChanged(state); }
          } else if (isSet(state.base)) {
            if (hasSetChanges(state)) { markChanged(state); }
          } else if (hasObjectChanges(state)) {
            markChanged(state);
          }
        }
      }
    }

    function markChangesRecursively(object) {
      if (!object || typeof object !== "object") { return; }
      var state = object[DRAFT_STATE];
      if (!state) { return; }
      var base = state.base,
          draft = state.draft,
          assigned = state.assigned;

      if (!Array.isArray(object)) {
        // Look for added keys.
        Object.keys(draft).forEach(function (key) {
          // The `undefined` check is a fast path for pre-existing keys.
          if (base[key] === undefined && !has(base, key)) {
            assigned[key] = true;
            markChanged(state);
          } else if (!assigned[key]) {
            // Only untouched properties trigger recursion.
            markChangesRecursively(draft[key]);
          }
        }); // Look for removed keys.

        Object.keys(base).forEach(function (key) {
          // The `undefined` check is a fast path for pre-existing keys.
          if (draft[key] === undefined && !has(draft, key)) {
            assigned[key] = false;
            markChanged(state);
          }
        });
      } else if (hasArrayChanges(state)) {
        markChanged(state);
        assigned.length = true;

        if (draft.length < base.length) {
          for (var i = draft.length; i < base.length; i++) { assigned[i] = false; }
        } else {
          for (var i = base.length; i < draft.length; i++) { assigned[i] = true; }
        }

        for (var i = 0; i < draft.length; i++) {
          // Only untouched indices trigger recursion.
          if (assigned[i] === undefined) { markChangesRecursively(draft[i]); }
        }
      }
    }

    function hasObjectChanges(state) {
      var base = state.base,
          draft = state.draft; // Search for added keys and changed keys. Start at the back, because
      // non-numeric keys are ordered by time of definition on the object.

      var keys = Object.keys(draft);

      for (var i = keys.length - 1; i >= 0; i--) {
        var key = keys[i];
        var baseValue = base[key]; // The `undefined` check is a fast path for pre-existing keys.

        if (baseValue === undefined && !has(base, key)) {
          return true;
        } // Once a base key is deleted, future changes go undetected, because its
        // descriptor is erased. This branch detects any missed changes.
        else {
            var value = draft[key];
            var state_1 = value && value[DRAFT_STATE];

            if (state_1 ? state_1.base !== baseValue : !is(value, baseValue)) {
              return true;
            }
          }
      } // At this point, no keys were added or changed.
      // Compare key count to determine if keys were deleted.


      return keys.length !== Object.keys(base).length;
    }

    function hasArrayChanges(state) {
      var draft = state.draft;
      if (draft.length !== state.base.length) { return true; } // See #116
      // If we first shorten the length, our array interceptors will be removed.
      // If after that new items are added, result in the same original length,
      // those last items will have no intercepting property.
      // So if there is no own descriptor on the last position, we know that items were removed and added
      // N.B.: splice, unshift, etc only shift values around, but not prop descriptors, so we only have to check
      // the last one

      var descriptor = Object.getOwnPropertyDescriptor(draft, draft.length - 1); // descriptor can be null, but only for newly created sparse arrays, eg. new Array(10)

      if (descriptor && !descriptor.get) { return true; } // For all other cases, we don't have to compare, as they would have been picked up by the index setters

      return false;
    }

    function hasMapChanges(state) {
      var base = state.base,
          draft = state.draft;
      if (base.size !== draft.size) { return true; } // IE11 supports only forEach iteration

      var hasChanges = false;
      draft.forEach(function (value, key) {
        if (!hasChanges) {
          hasChanges = isDraftable(value) ? value.modified : value !== base.get(key);
        }
      });
      return hasChanges;
    }

    function hasSetChanges(state) {
      var base = state.base,
          draft = state.draft;
      if (base.size !== draft.size) { return true; } // IE11 supports only forEach iteration

      var hasChanges = false;
      draft.forEach(function (value, key) {
        if (!hasChanges) {
          hasChanges = isDraftable(value) ? value.modified : !base.has(key);
        }
      });
      return hasChanges;
    }

    function createHiddenProperty(target, prop, value) {
      Object.defineProperty(target, prop, {
        value: value,
        enumerable: false,
        writable: true
      });
    }

    var legacyProxy = /*#__PURE__*/Object.freeze({
        __proto__: null,
        willFinalize: willFinalize,
        createProxy: createProxy
    });

    var _a$1, _b;

    function willFinalize$1() {}
    /**
     * Returns a new draft of the `base` object.
     *
     * The second argument is the parent draft-state (used internally).
     */

    function createProxy$1(base, parent) {
      var scope = parent ? parent.scope : ImmerScope.current;
      var state = {
        // Track which produce call this is associated with.
        scope: scope,
        // True for both shallow and deep changes.
        modified: false,
        // Used during finalization.
        finalized: false,
        // Track which properties have been assigned (true) or deleted (false).
        assigned: {},
        // The parent draft state.
        parent: parent,
        // The base state.
        base: base,
        // The base proxy.
        draft: null,
        // Any property proxies.
        drafts: {},
        // The base copy with any updated values.
        copy: null,
        // Called by the `produce` function.
        revoke: null
      }; // the traps must target something, a bit like the 'real' base.
      // but also, we need to be able to determine from the target what the relevant state is
      // (to avoid creating traps per instance to capture the state in closure,
      // and to avoid creating weird hidden properties as well)
      // So the trick is to use 'state' as the actual 'target'! (and make sure we intercept everything)
      // Note that in the case of an array, we put the state in an array to have better Reflect defaults ootb

      var target = state;
      var traps = objectTraps;

      if (Array.isArray(base)) {
        target = [state];
        traps = arrayTraps;
      } // Map drafts must support object keys, so we use Map objects to track changes.
      else if (isMap(base)) {
          traps = mapTraps$1;
          state.drafts = new Map();
          state.assigned = new Map();
        } // Set drafts use a Map object to track which of its values are drafted.
        // And we don't need the "assigned" property, because Set objects have no keys.
        else if (isSet(base)) {
            traps = setTraps$1;
            state.drafts = new Map();
          }

      var _a = Proxy.revocable(target, traps),
          revoke = _a.revoke,
          proxy = _a.proxy;

      state.draft = proxy;
      state.revoke = revoke;
      scope.drafts.push(proxy);
      return proxy;
    }
    /**
     * Object drafts
     */

    var objectTraps = {
      get: function (state, prop) {
        if (prop === DRAFT_STATE) { return state; }
        var drafts = state.drafts; // Check for existing draft in unmodified state.

        if (!state.modified && has(drafts, prop)) {
          return drafts[prop];
        }

        var value = latest$2(state)[prop];

        if (state.finalized || !isDraftable(value)) {
          return value;
        } // Check for existing draft in modified state.


        if (state.modified) {
          // Assigned values are never drafted. This catches any drafts we created, too.
          if (value !== peek$1(state.base, prop)) { return value; } // Store drafts on the copy (when one exists).

          drafts = state.copy;
        }

        return drafts[prop] = createProxy$1(value, state);
      },
      has: function (state, prop) {
        return prop in latest$2(state);
      },
      ownKeys: function (state) {
        return Reflect.ownKeys(latest$2(state));
      },
      set: function (state, prop, value) {
        if (!state.modified) {
          var baseValue = peek$1(state.base, prop); // Optimize based on value's truthiness. Truthy values are guaranteed to
          // never be undefined, so we can avoid the `in` operator. Lastly, truthy
          // values may be drafts, but falsy values are never drafts.

          var isUnchanged = value ? is(baseValue, value) || value === state.drafts[prop] : is(baseValue, value) && prop in state.base;
          if (isUnchanged) { return true; }
          markChanged$1(state);
        }

        state.assigned[prop] = true;
        state.copy[prop] = value;
        return true;
      },
      deleteProperty: function (state, prop) {
        // The `undefined` check is a fast path for pre-existing keys.
        if (peek$1(state.base, prop) !== undefined || prop in state.base) {
          state.assigned[prop] = false;
          markChanged$1(state);
        } else if (state.assigned[prop]) {
          // if an originally not assigned property was deleted
          delete state.assigned[prop];
        }

        if (state.copy) { delete state.copy[prop]; }
        return true;
      },
      // Note: We never coerce `desc.value` into an Immer draft, because we can't make
      // the same guarantee in ES5 mode.
      getOwnPropertyDescriptor: function (state, prop) {
        var owner = latest$2(state);
        var desc = Reflect.getOwnPropertyDescriptor(owner, prop);

        if (desc) {
          desc.writable = true;
          desc.configurable = !Array.isArray(owner) || prop !== "length";
        }

        return desc;
      },
      defineProperty: function () {
        throw new Error("Object.defineProperty() cannot be used on an Immer draft"); // prettier-ignore
      },
      getPrototypeOf: function (state) {
        return Object.getPrototypeOf(state.base);
      },
      setPrototypeOf: function () {
        throw new Error("Object.setPrototypeOf() cannot be used on an Immer draft"); // prettier-ignore
      }
    };
    /**
     * Array drafts
     */

    var arrayTraps = {};
    each(objectTraps, function (key, fn) {
      arrayTraps[key] = function () {
        arguments[0] = arguments[0][0];
        return fn.apply(this, arguments);
      };
    });

    arrayTraps.deleteProperty = function (state, prop) {
      if (isNaN(parseInt(prop))) {
        throw new Error("Immer only supports deleting array indices"); // prettier-ignore
      }

      return objectTraps.deleteProperty.call(this, state[0], prop);
    };

    arrayTraps.set = function (state, prop, value) {
      if (prop !== "length" && isNaN(parseInt(prop))) {
        throw new Error("Immer only supports setting array indices and the 'length' property"); // prettier-ignore
      }

      return objectTraps.set.call(this, state[0], prop, value, state[0]);
    }; // Used by Map and Set drafts


    var reflectTraps = makeReflectTraps(["ownKeys", "has", "set", "deleteProperty", "defineProperty", "getOwnPropertyDescriptor", "preventExtensions", "isExtensible", "getPrototypeOf"]);
    /**
     * Map drafts
     */

    var mapTraps$1 = makeTrapsForGetters((_a$1 = {}, _a$1[DRAFT_STATE] = function (state) {
      return state;
    }, _a$1.size = function (state) {
      return latest$2(state).size;
    }, _a$1.has = function (state) {
      return function (key) {
        return latest$2(state).has(key);
      };
    }, _a$1.set = function (state) {
      return function (key, value) {
        var values = latest$2(state);

        if (!values.has(key) || values.get(key) !== value) {
          markChanged$1(state); // @ts-ignore

          state.assigned.set(key, true);
          state.copy.set(key, value);
        }

        return state.draft;
      };
    }, _a$1["delete"] = function (state) {
      return function (key) {
        if (latest$2(state).has(key)) {
          markChanged$1(state); // @ts-ignore

          state.assigned.set(key, false);
          return state.copy["delete"](key);
        }

        return false;
      };
    }, _a$1.clear = function (state) {
      return function () {
        markChanged$1(state);
        state.assigned = new Map();
        each(latest$2(state).keys(), function (_, key) {
          // @ts-ignore
          state.assigned.set(key, false);
        });
        return state.copy.clear();
      };
    }, // @ts-ignore
    _a$1.forEach = function (state, _, receiver) {
      return function (cb, thisArg) {
        return latest$2(state).forEach(function (_, key, map) {
          var value = receiver.get(key);
          cb.call(thisArg, value, key, map);
        });
      };
    }, _a$1.get = function (state) {
      return function (key) {
        var drafts = state.modified ? state.copy : state.drafts; // @ts-ignore TODO: ...or fix by using different ES6Draft types (but better just unify to maps)

        if (drafts.has(key)) {
          // @ts-ignore
          var value_1 = drafts.get(key);
          if (isDraft(value_1) || !isDraftable(value_1)) { return value_1; }
          var draft_1 = createProxy$1(value_1, state); // @ts-ignore

          drafts.set(key, draft_1);
          return draft_1;
        }

        var value = latest$2(state).get(key);

        if (state.finalized || !isDraftable(value)) {
          return value;
        }

        var draft = createProxy$1(value, state); //@ts-ignore

        drafts.set(key, draft);
        return draft;
      };
    }, _a$1.keys = function (state) {
      return function () {
        return latest$2(state).keys();
      };
    }, //@ts-ignore
    _a$1.values = iterateMapValues, //@ts-ignore
    _a$1.entries = iterateMapValues, _a$1[hasSymbol ? Symbol.iterator : "@@iterator"] = iterateMapValues, _a$1));
    var iterateSetValues$1 = makeIterateSetValues(createProxy$1);
    /**
     * Set drafts
     */

    var setTraps$1 = makeTrapsForGetters((_b = {}, //@ts-ignore
    _b[DRAFT_STATE] = function (state) {
      return state;
    }, _b.size = function (state) {
      return latest$2(state).size;
    }, _b.has = function (state) {
      return function (key) {
        return latest$2(state).has(key);
      };
    }, _b.add = function (state) {
      return function (value) {
        if (!latest$2(state).has(value)) {
          markChanged$1(state); //@ts-ignore

          state.copy.add(value);
        }

        return state.draft;
      };
    }, _b["delete"] = function (state) {
      return function (value) {
        markChanged$1(state); //@ts-ignore

        return state.copy["delete"](value);
      };
    }, _b.clear = function (state) {
      return function () {
        markChanged$1(state); //@ts-ignore

        return state.copy.clear();
      };
    }, _b.forEach = function (state) {
      return function (cb, thisArg) {
        var iterator = iterateSetValues$1(state)();
        var result = iterator.next();

        while (!result.done) {
          cb.call(thisArg, result.value, result.value, state.draft);
          result = iterator.next();
        }
      };
    }, _b.keys = iterateSetValues$1, _b.values = iterateSetValues$1, _b.entries = iterateSetValues$1, _b[hasSymbol ? Symbol.iterator : "@@iterator"] = iterateSetValues$1, _b));
    /**
     * Helpers
     */
    // Retrieve the latest values of the draft.

    function latest$2(state) {
      return state.copy || state.base;
    } // Access a property without creating an Immer draft.


    function peek$1(draft, prop) {
      var state = draft[DRAFT_STATE];
      var desc = Reflect.getOwnPropertyDescriptor(state ? latest$2(state) : draft, prop);
      return desc && desc.value;
    }

    function markChanged$1(state) {
      if (!state.modified) {
        state.modified = true;
        var base = state.base,
            drafts = state.drafts,
            parent = state.parent;
        var copy = shallowCopy(base);

        if (isSet(base)) {
          // Note: The `drafts` property is preserved for Set objects, since
          // we need to keep track of which values are drafted.
          assignSet(copy, drafts);
        } else {
          // Merge nested drafts into the copy.
          if (isMap(base)) { assignMap(copy, drafts); }else { assign(copy, drafts); }
          state.drafts = null;
        }

        state.copy = copy;

        if (parent) {
          markChanged$1(parent);
        }
      }
    }
    /** Create traps that all use the `Reflect` API on the `latest(state)` */


    function makeReflectTraps(names) {
      return names.reduce(function (traps, name) {
        // @ts-ignore
        traps[name] = function (state) {
          var arguments$1 = arguments;

          var args = [];

          for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments$1[_i];
          }

          return Reflect[name].apply(Reflect, __spreadArrays([latest$2(state)], args));
        };

        return traps;
      }, {});
    }

    function makeTrapsForGetters(getters) {
      return assign({}, reflectTraps, {
        get: function (state, prop, receiver) {
          return getters.hasOwnProperty(prop) ? getters[prop](state, prop, receiver) : Reflect.get(state, prop, receiver);
        },
        setPrototypeOf: function (state) {
          throw new Error("Object.setPrototypeOf() cannot be used on an Immer draft"); // prettier-ignore
        }
      });
    }

    var modernProxy = /*#__PURE__*/Object.freeze({
        __proto__: null,
        willFinalize: willFinalize$1,
        createProxy: createProxy$1
    });

    function generatePatches(state, basePath, patches, inversePatches) {
      var generatePatchesFn = Array.isArray(state.base) ? generateArrayPatches : isSet(state.base) ? generateSetPatches : generatePatchesFromAssigned;
      generatePatchesFn(state, basePath, patches, inversePatches);
    }

    function generateArrayPatches(state, basePath, patches, inversePatches) {
      var _a, _b;

      var base = state.base,
          copy = state.copy,
          assigned = state.assigned; // Reduce complexity by ensuring `base` is never longer.

      if (copy.length < base.length) {
        _a = [copy, base], base = _a[0], copy = _a[1];
        _b = [inversePatches, patches], patches = _b[0], inversePatches = _b[1];
      }

      var delta = copy.length - base.length; // Find the first replaced index.

      var start = 0;

      while (base[start] === copy[start] && start < base.length) {
        ++start;
      } // Find the last replaced index. Search from the end to optimize splice patches.


      var end = base.length;

      while (end > start && base[end - 1] === copy[end + delta - 1]) {
        --end;
      } // Process replaced indices.


      for (var i = start; i < end; ++i) {
        if (assigned[i] && copy[i] !== base[i]) {
          var path = basePath.concat([i]);
          patches.push({
            op: "replace",
            path: path,
            value: copy[i]
          });
          inversePatches.push({
            op: "replace",
            path: path,
            value: base[i]
          });
        }
      }

      var replaceCount = patches.length; // Process added indices.

      for (var i = end + delta - 1; i >= end; --i) {
        var path = basePath.concat([i]);
        patches[replaceCount + i - end] = {
          op: "add",
          path: path,
          value: copy[i]
        };
        inversePatches.push({
          op: "remove",
          path: path
        });
      }
    } // This is used for both Map objects and normal objects.


    function generatePatchesFromAssigned(state, basePath, patches, inversePatches) {
      var base = state.base,
          copy = state.copy;
      each(state.assigned, function (key, assignedValue) {
        var origValue = get(base, key);
        var value = get(copy, key);
        var op = !assignedValue ? "remove" : has(base, key) ? "replace" : "add";
        if (origValue === value && op === "replace") { return; }
        var path = basePath.concat(key);
        patches.push(op === "remove" ? {
          op: op,
          path: path
        } : {
          op: op,
          path: path,
          value: value
        });
        inversePatches.push(op === "add" ? {
          op: "remove",
          path: path
        } : op === "remove" ? {
          op: "add",
          path: path,
          value: origValue
        } : {
          op: "replace",
          path: path,
          value: origValue
        });
      });
    }

    function generateSetPatches(state, basePath, patches, inversePatches) {
      var base = state.base,
          copy = state.copy;
      var i = 0;
      base.forEach(function (value) {
        if (!copy.has(value)) {
          var path = basePath.concat([i]);
          patches.push({
            op: "remove",
            path: path,
            value: value
          });
          inversePatches.unshift({
            op: "add",
            path: path,
            value: value
          });
        }

        i++;
      });
      i = 0;
      copy.forEach(function (value) {
        if (!base.has(value)) {
          var path = basePath.concat([i]);
          patches.push({
            op: "add",
            path: path,
            value: value
          });
          inversePatches.unshift({
            op: "remove",
            path: path,
            value: value
          });
        }

        i++;
      });
    }

    function applyPatches(draft, patches) {
      patches.forEach(function (patch) {
        var path = patch.path,
            op = patch.op;
        if (!path.length) { throw new Error("Illegal state"); }
        var base = draft;

        for (var i = 0; i < path.length - 1; i++) {
          base = get(base, path[i]);
          if (!base || typeof base !== "object") { throw new Error("Cannot apply patch, path doesn't resolve: " + path.join("/")); } // prettier-ignore
        }

        var value = clone(patch.value); // used to clone patch to ensure original patch is not modified, see #411

        var key = path[path.length - 1];

        switch (op) {
          case "replace":
            if (isMap(base)) {
              base.set(key, value);
            } else if (isSet(base)) {
              throw new Error('Sets cannot have "replace" patches.');
            } else {
              // if value is an object, then it's assigned by reference
              // in the following add or remove ops, the value field inside the patch will also be modifyed
              // so we use value from the cloned patch
              base[key] = value;
            }

            break;

          case "add":
            if (isSet(base)) {
              base["delete"](patch.value);
            }

            Array.isArray(base) ? base.splice(key, 0, value) : isMap(base) ? base.set(key, value) : isSet(base) ? base.add(value) : base[key] = value;
            break;

          case "remove":
            Array.isArray(base) ? base.splice(key, 1) : isMap(base) ? base["delete"](key) : isSet(base) ? base["delete"](patch.value) : delete base[key];
            break;

          default:
            throw new Error("Unsupported patch operation: " + op);
        }
      });
      return draft;
    }

    function verifyMinified() {}

    var configDefaults = {
      useProxies: typeof Proxy !== "undefined" && typeof Proxy.revocable !== "undefined" && typeof Reflect !== "undefined",
      autoFreeze: typeof process !== "undefined" ? "development" !== "production" : verifyMinified.name === "verifyMinified",
      onAssign: null,
      onDelete: null,
      onCopy: null
    };

    var Immer =
    /** @class */
    function () {
      function Immer(config) {
        this.useProxies = false;
        this.autoFreeze = false;
        assign(this, configDefaults, config);
        this.setUseProxies(this.useProxies);
        this.produce = this.produce.bind(this);
        this.produceWithPatches = this.produceWithPatches.bind(this);
      }
      /**
       * The `produce` function takes a value and a "recipe function" (whose
       * return value often depends on the base state). The recipe function is
       * free to mutate its first argument however it wants. All mutations are
       * only ever applied to a __copy__ of the base state.
       *
       * Pass only a function to create a "curried producer" which relieves you
       * from passing the recipe function every time.
       *
       * Only plain objects and arrays are made mutable. All other objects are
       * considered uncopyable.
       *
       * Note: This function is __bound__ to its `Immer` instance.
       *
       * @param {any} base - the initial state
       * @param {Function} producer - function that receives a proxy of the base state as first argument and which can be freely modified
       * @param {Function} patchListener - optional function that will be called with all the patches produced here
       * @returns {any} a new state, or the initial state if nothing was modified
       */


      Immer.prototype.produce = function (base, recipe, patchListener) {
        var _this = this; // curried invocation


        if (typeof base === "function" && typeof recipe !== "function") {
          var defaultBase_1 = recipe;
          recipe = base;
          var self_1 = this;
          return function curriedProduce(base) {
            var arguments$1 = arguments;

            var _this = this;

            if (base === void 0) {
              base = defaultBase_1;
            }

            var args = [];

            for (var _i = 1; _i < arguments.length; _i++) {
              args[_i - 1] = arguments$1[_i];
            }

            return self_1.produce(base, function (draft) {
              return recipe.call.apply(recipe, __spreadArrays([_this, draft], args));
            }); // prettier-ignore
          };
        } // prettier-ignore


        {
          if (typeof recipe !== "function") {
            throw new Error("The first or second argument to `produce` must be a function");
          }

          if (patchListener !== undefined && typeof patchListener !== "function") {
            throw new Error("The third argument to `produce` must be a function or undefined");
          }
        }
        var result; // Only plain objects, arrays, and "immerable classes" are drafted.

        if (isDraftable(base)) {
          var scope_1 = ImmerScope.enter();
          var proxy = this.createProxy(base);
          var hasError = true;

          try {
            result = recipe(proxy);
            hasError = false;
          } finally {
            // finally instead of catch + rethrow better preserves original stack
            if (hasError) { scope_1.revoke(); }else { scope_1.leave(); }
          }

          if (typeof Promise !== "undefined" && result instanceof Promise) {
            return result.then(function (result) {
              scope_1.usePatches(patchListener);
              return _this.processResult(result, scope_1);
            }, function (error) {
              scope_1.revoke();
              throw error;
            });
          }

          scope_1.usePatches(patchListener);
          return this.processResult(result, scope_1);
        } else {
          result = recipe(base);
          if (result === NOTHING) { return undefined; }
          if (result === undefined) { result = base; }
          this.maybeFreeze(result, true);
          return result;
        }
      };

      Immer.prototype.produceWithPatches = function (arg1, arg2, arg3) {
        var _this = this;

        if (typeof arg1 === "function") {
          return function (state) {
            var arguments$1 = arguments;

            var args = [];

            for (var _i = 1; _i < arguments.length; _i++) {
              args[_i - 1] = arguments$1[_i];
            }

            return _this.produceWithPatches(state, function (draft) {
              return arg1.apply(void 0, __spreadArrays([draft], args));
            });
          };
        } // non-curried form


        if (arg3) { throw new Error("A patch listener cannot be passed to produceWithPatches"); }
        var patches, inversePatches;
        var nextState = this.produce(arg1, arg2, function (p, ip) {
          patches = p;
          inversePatches = ip;
        });
        return [nextState, patches, inversePatches];
      };

      Immer.prototype.createDraft = function (base) {
        if (!isDraftable(base)) {
          throw new Error("First argument to `createDraft` must be a plain object, an array, or an immerable object"); // prettier-ignore
        }

        var scope = ImmerScope.enter();
        var proxy = this.createProxy(base);
        proxy[DRAFT_STATE].isManual = true;
        scope.leave();
        return proxy;
      };

      Immer.prototype.finishDraft = function (draft, patchListener) {
        var state = draft && draft[DRAFT_STATE];

        if (!state || !state.isManual) {
          throw new Error("First argument to `finishDraft` must be a draft returned by `createDraft`"); // prettier-ignore
        }

        if (state.finalized) {
          throw new Error("The given draft is already finalized"); // prettier-ignore
        }

        var scope = state.scope;
        scope.usePatches(patchListener);
        return this.processResult(undefined, scope);
      };
      /**
       * Pass true to automatically freeze all copies created by Immer.
       *
       * By default, auto-freezing is disabled in production.
       */


      Immer.prototype.setAutoFreeze = function (value) {
        this.autoFreeze = value;
      };
      /**
       * Pass true to use the ES2015 `Proxy` class when creating drafts, which is
       * always faster than using ES5 proxies.
       *
       * By default, feature detection is used, so calling this is rarely necessary.
       */


      Immer.prototype.setUseProxies = function (value) {
        this.useProxies = value;
        assign(this, value ? modernProxy : legacyProxy);
      };

      Immer.prototype.applyPatches = function (base, patches) {
        // If a patch replaces the entire state, take that replacement as base
        // before applying patches
        var i;

        for (i = patches.length - 1; i >= 0; i--) {
          var patch = patches[i];

          if (patch.path.length === 0 && patch.op === "replace") {
            base = patch.value;
            break;
          }
        }

        if (isDraft(base)) {
          // N.B: never hits if some patch a replacement, patches are never drafts
          return applyPatches(base, patches);
        } // Otherwise, produce a copy of the base state.


        return this.produce(base, function (draft) {
          return applyPatches(draft, patches.slice(i + 1));
        });
      };
      /** @internal */


      Immer.prototype.processResult = function (result, scope) {
        var baseDraft = scope.drafts[0];
        var isReplaced = result !== undefined && result !== baseDraft;
        this.willFinalize(scope, result, isReplaced);

        if (isReplaced) {
          if (baseDraft[DRAFT_STATE].modified) {
            scope.revoke();
            throw new Error("An immer producer returned a new value *and* modified its draft. Either return a new value *or* modify the draft."); // prettier-ignore
          }

          if (isDraftable(result)) {
            // Finalize the result in case it contains (or is) a subset of the draft.
            result = this.finalize(result, null, scope);
            this.maybeFreeze(result);
          }

          if (scope.patches) {
            scope.patches.push({
              op: "replace",
              path: [],
              value: result
            });
            scope.inversePatches.push({
              op: "replace",
              path: [],
              value: baseDraft[DRAFT_STATE].base
            });
          }
        } else {
          // Finalize the base draft.
          result = this.finalize(baseDraft, [], scope);
        }

        scope.revoke();

        if (scope.patches) {
          scope.patchListener(scope.patches, scope.inversePatches);
        }

        return result !== NOTHING ? result : undefined;
      };
      /**
       * @internal
       * Finalize a draft, returning either the unmodified base state or a modified
       * copy of the base state.
       */


      Immer.prototype.finalize = function (draft, path, scope) {
        var _this = this;

        var state = draft[DRAFT_STATE];

        if (!state) {
          if (Object.isFrozen(draft)) { return draft; }
          return this.finalizeTree(draft, null, scope);
        } // Never finalize drafts owned by another scope.


        if (state.scope !== scope) {
          return draft;
        }

        if (!state.modified) {
          this.maybeFreeze(state.base, true);
          return state.base;
        }

        if (!state.finalized) {
          state.finalized = true;
          this.finalizeTree(state.draft, path, scope); // We cannot really delete anything inside of a Set. We can only replace the whole Set.

          if (this.onDelete && !isSet(state.base)) {
            // The `assigned` object is unreliable with ES5 drafts.
            if (this.useProxies) {
              var assigned = state.assigned;
              each(assigned, function (prop, exists) {
                var _a, _b;

                if (!exists) { (_b = (_a = _this).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a, state, prop); }
              });
            } else {
              // TODO: Figure it out for Maps and Sets if we need to support ES5
              var base = state.base,
                  copy_1 = state.copy;
              each(base, function (prop) {
                var _a, _b;

                if (!has(copy_1, prop)) { (_b = (_a = _this).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a, state, prop); }
              });
            }
          }

          if (this.onCopy) {
            this.onCopy(state);
          } // At this point, all descendants of `state.copy` have been finalized,
          // so we can be sure that `scope.canAutoFreeze` is accurate.


          if (this.autoFreeze && scope.canAutoFreeze) {
            freeze(state.copy, false);
          }

          if (path && scope.patches) {
            generatePatches(state, path, scope.patches, scope.inversePatches);
          }
        }

        return state.copy;
      };
      /**
       * @internal
       * Finalize all drafts in the given state tree.
       */


      Immer.prototype.finalizeTree = function (root, rootPath, scope) {
        var _this = this;

        var state = root[DRAFT_STATE];

        if (state) {
          if (!this.useProxies) {
            // Create the final copy, with added keys and without deleted keys.
            state.copy = shallowCopy(state.draft, true);
          }

          root = state.copy;
        }

        var needPatches = !!rootPath && !!scope.patches;

        var finalizeProperty = function (prop, value, parent) {
          if (value === parent) {
            throw Error("Immer forbids circular references");
          } // In the `finalizeTree` method, only the `root` object may be a draft.


          var isDraftProp = !!state && parent === root;
          var isSetMember = isSet(parent);

          if (isDraft(value)) {
            var path = isDraftProp && needPatches && !isSetMember && // Set objects are atomic since they have no keys.
            !has(state.assigned, prop) // Skip deep patches for assigned keys.
            ? rootPath.concat(prop) : null; // Drafts owned by `scope` are finalized here.

            value = _this.finalize(value, path, scope);
            replace(parent, prop, value); // Drafts from another scope must prevent auto-freezing.

            if (isDraft(value)) {
              scope.canAutoFreeze = false;
            } // Unchanged drafts are never passed to the `onAssign` hook.


            if (isDraftProp && value === get(state.base, prop)) { return; }
          } // Unchanged draft properties are ignored.
          else if (isDraftProp && is(value, get(state.base, prop))) {
              return;
            } // Search new objects for unfinalized drafts. Frozen objects should never contain drafts.
            else if (isDraftable(value) && !Object.isFrozen(value)) {
                each(value, finalizeProperty);

                _this.maybeFreeze(value);
              }

          if (isDraftProp && _this.onAssign && !isSetMember) {
            _this.onAssign(state, prop, value);
          }
        };

        each(root, finalizeProperty);
        return root;
      };

      Immer.prototype.maybeFreeze = function (value, deep) {
        if (deep === void 0) {
          deep = false;
        }

        if (this.autoFreeze && !isDraft(value)) {
          freeze(value, deep);
        }
      };

      return Immer;
    }();

    function replace(parent, prop, value) {
      if (isMap(parent)) {
        parent.set(prop, value);
      } else if (isSet(parent)) {
        // In this case, the `prop` is actually a draft.
        parent["delete"](prop);
        parent.add(value);
      } else if (Array.isArray(parent) || isEnumerable(parent, prop)) {
        // Preserve non-enumerable properties.
        parent[prop] = value;
      } else {
        Object.defineProperty(parent, prop, {
          value: value,
          writable: true,
          configurable: true
        });
      }
    }

    var immer = new Immer();
    /**
     * The `produce` function takes a value and a "recipe function" (whose
     * return value often depends on the base state). The recipe function is
     * free to mutate its first argument however it wants. All mutations are
     * only ever applied to a __copy__ of the base state.
     *
     * Pass only a function to create a "curried producer" which relieves you
     * from passing the recipe function every time.
     *
     * Only plain objects and arrays are made mutable. All other objects are
     * considered uncopyable.
     *
     * Note: This function is __bound__ to its `Immer` instance.
     *
     * @param {any} base - the initial state
     * @param {Function} producer - function that receives a proxy of the base state as first argument and which can be freely modified
     * @param {Function} patchListener - optional function that will be called with all the patches produced here
     * @returns {any} a new state, or the initial state if nothing was modified
     */

    var produce = immer.produce;
    /**
     * Like `produce`, but `produceWithPatches` always returns a tuple
     * [nextState, patches, inversePatches] (instead of just the next state)
     */

    var produceWithPatches = immer.produceWithPatches.bind(immer);
    /**
     * Pass true to automatically freeze all copies created by Immer.
     *
     * By default, auto-freezing is disabled in production.
     */

    var setAutoFreeze = immer.setAutoFreeze.bind(immer);
    /**
     * Pass true to use the ES2015 `Proxy` class when creating drafts, which is
     * always faster than using ES5 proxies.
     *
     * By default, feature detection is used, so calling this is rarely necessary.
     */

    var setUseProxies = immer.setUseProxies.bind(immer);
    /**
     * Apply an array of Immer patches to the first argument.
     *
     * This function is a producer, which means copy-on-write is in effect.
     */

    var applyPatches$1 = immer.applyPatches.bind(immer);
    /**
     * Create an Immer draft from the given base state, which may be a draft itself.
     * The draft can be modified until you finalize it with the `finishDraft` function.
     */

    var createDraft = immer.createDraft.bind(immer);
    /**
     * Finalize an Immer draft from a `createDraft` call, returning the base state
     * (if no changes were made) or a modified copy. The draft must *not* be
     * mutated afterwards.
     *
     * Pass a function as the 2nd argument to generate Immer patches based on the
     * changes that were made.
     */

    var finishDraft = immer.finishDraft.bind(immer);
    //# sourceMappingURL=immer.module.js.map

    const initialState = {
        todolist : [
            { no:1, todo:"Buy Laptop Computer", desc:"Macbook 16 inch(A-shop)" , done:false },
            { no:2, todo:"Study ES6", desc:"especially about Spread Operator and Arrow Function", done:false },
            { no:3, todo:"Study Vue 3", desc:"about Composition API, Vuex and Vue-router", done:true },
            { no:4, todo:"Study React", desc:"about Hook, Redux and Context API", done:false },
        ]
    };

    const todoReducer = (state=initialState, action) => {
        let index, newTodoList;
        switch(action.type) {
            case Constant.ADD_TODO :
                newTodoList = produce(state.todolist, (draft)=> {
                    draft.push({ no:new Date().getTime(), 
                        todo:action.payload.todo, desc:action.payload.desc, done:false});
                });
                return { todolist: newTodoList };
            case Constant.DELETE_TODO : 
                index = state.todolist.findIndex((item)=>item.no === action.payload.no);
                newTodoList = produce(state.todolist, (draft)=> {
                    draft.splice(index,1);
                });
                return { todolist: newTodoList };
            case Constant.TOGGLE_DONE : 
                index = state.todolist.findIndex((item)=>item.no === action.payload.no);
                newTodoList = produce(state.todolist, (draft)=> {
                    draft[index].done = !draft[index].done;
                });
                return { todolist: newTodoList };
            case Constant.UPDATE_TODO : 
                index = state.todolist.findIndex((item)=>item.no === action.payload.no);
                newTodoList = produce(state.todolist, (draft)=> {
                    draft[index] = action.payload;
                });
                return { todolist: newTodoList };
            default : 
                return state;
        }
    };

    const todoAction = {
        addTodo({todo, desc}) {
            return { type: Constant.ADD_TODO, payload: { todo, desc } }
        },
        deleteTodo(no) {
            return {type: Constant.DELETE_TODO, payload: { no } }
        },
        toggleDone(no) {
            return { type: Constant.TOGGLE_DONE, payload : { no } }
        },
        updateTodo({no, todo, desc, done}) {
            return { type: Constant.UPDATE_TODO, payload : { no, todo, desc, done } }
        }
    };

    function unwrapExports (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var reduxDevtoolsExtension = createCommonjsModule(function (module, exports) {

    var compose = es.compose;

    exports.__esModule = true;
    exports.composeWithDevTools = (
      typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ?
        window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ :
        function() {
          if (arguments.length === 0) return undefined;
          if (typeof arguments[0] === 'object') return compose;
          return compose.apply(null, arguments);
        }
    );

    exports.devToolsEnhancer = (
      typeof window !== 'undefined' && window.__REDUX_DEVTOOLS_EXTENSION__ ?
        window.__REDUX_DEVTOOLS_EXTENSION__ :
        function() { return function(noop) { return noop; } }
    );
    });

    unwrapExports(reduxDevtoolsExtension);
    var reduxDevtoolsExtension_1 = reduxDevtoolsExtension.composeWithDevTools;
    var reduxDevtoolsExtension_2 = reduxDevtoolsExtension.devToolsEnhancer;

    /**
     * Copyright (c) 2013-present, Facebook, Inc.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */

    var invariant = function(condition, format, a, b, c, d, e, f) {
      {
        if (format === undefined) {
          throw new Error('invariant requires an error message argument');
        }
      }

      if (!condition) {
        var error;
        if (format === undefined) {
          error = new Error(
            'Minified exception occurred; use the non-minified dev environment ' +
            'for the full error message and additional helpful warnings.'
          );
        } else {
          var args = [a, b, c, d, e, f];
          var argIndex = 0;
          error = new Error(
            format.replace(/%s/g, function() { return args[argIndex++]; })
          );
          error.name = 'Invariant Violation';
        }

        error.framesToPop = 1; // we don't care about invariant's own frame
        throw error;
      }
    };

    var invariant_1 = invariant;

    var stringify_1 = createCommonjsModule(function (module, exports) {
    exports = module.exports = stringify;
    exports.getSerialize = serializer;

    function stringify(obj, replacer, spaces, cycleReplacer) {
      return JSON.stringify(obj, serializer(replacer, cycleReplacer), spaces)
    }

    function serializer(replacer, cycleReplacer) {
      var stack = [], keys = [];

      if (cycleReplacer == null) cycleReplacer = function(key, value) {
        if (stack[0] === value) return "[Circular ~]"
        return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join(".") + "]"
      };

      return function(key, value) {
        if (stack.length > 0) {
          var thisPos = stack.indexOf(this);
          ~thisPos ? stack.splice(thisPos + 1) : stack.push(this);
          ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key);
          if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value);
        }
        else stack.push(value);

        return replacer == null ? value : replacer.call(this, key, value)
      }
    }
    });
    var stringify_2 = stringify_1.getSerialize;

    var isImmutable = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, "__esModule", {
      value: true
    });

    var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

    exports.default = isImmutableDefault;
    function isImmutableDefault(value) {
      return (typeof value === 'undefined' ? 'undefined' : _typeof(value)) !== 'object' || value === null || typeof value === 'undefined';
    }
    });

    unwrapExports(isImmutable);

    var trackForMutations_1 = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = trackForMutations;
    function trackForMutations(isImmutable, ignore, obj) {
      var trackedProperties = trackProperties(isImmutable, ignore, obj);
      return {
        detectMutations: function detectMutations() {
          return _detectMutations(isImmutable, ignore, trackedProperties, obj);
        }
      };
    }

    function trackProperties(isImmutable) {
      var ignore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      var obj = arguments[2];
      var path = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : [];

      var tracked = { value: obj };

      if (!isImmutable(obj)) {
        tracked.children = {};

        for (var key in obj) {
          var childPath = path.concat(key);
          if (ignore.length && ignore.indexOf(childPath.join('.')) !== -1) {
            continue;
          }

          tracked.children[key] = trackProperties(isImmutable, ignore, obj[key], childPath);
        }
      }
      return tracked;
    }

    function _detectMutations(isImmutable) {
      var ignore = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      var trackedProperty = arguments[2];
      var obj = arguments[3];
      var sameParentRef = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
      var path = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : [];

      var prevObj = trackedProperty ? trackedProperty.value : undefined;

      var sameRef = prevObj === obj;

      if (sameParentRef && !sameRef && !Number.isNaN(obj)) {
        return { wasMutated: true, path: path };
      }

      if (isImmutable(prevObj) || isImmutable(obj)) {
        return { wasMutated: false };
      }

      // Gather all keys from prev (tracked) and after objs
      var keysToDetect = {};
      Object.keys(trackedProperty.children).forEach(function (key) {
        keysToDetect[key] = true;
      });
      Object.keys(obj).forEach(function (key) {
        keysToDetect[key] = true;
      });

      var keys = Object.keys(keysToDetect);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var childPath = path.concat(key);
        if (ignore.length && ignore.indexOf(childPath.join('.')) !== -1) {
          continue;
        }

        var result = _detectMutations(isImmutable, ignore, trackedProperty.children[key], obj[key], sameRef, childPath);

        if (result.wasMutated) {
          return result;
        }
      }
      return { wasMutated: false };
    }
    });

    unwrapExports(trackForMutations_1);

    var dist = createCommonjsModule(function (module, exports) {

    Object.defineProperty(exports, "__esModule", {
      value: true
    });
    exports.default = immutableStateInvariantMiddleware;



    var _invariant2 = _interopRequireDefault(invariant_1);



    var _jsonStringifySafe2 = _interopRequireDefault(stringify_1);



    var _isImmutable2 = _interopRequireDefault(isImmutable);



    var _trackForMutations2 = _interopRequireDefault(trackForMutations_1);

    function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

    var BETWEEN_DISPATCHES_MESSAGE = ['A state mutation was detected between dispatches, in the path `%s`.', 'This may cause incorrect behavior.', '(http://redux.js.org/docs/Troubleshooting.html#never-mutate-reducer-arguments)'].join(' ');

    var INSIDE_DISPATCH_MESSAGE = ['A state mutation was detected inside a dispatch, in the path: `%s`.', 'Take a look at the reducer(s) handling the action %s.', '(http://redux.js.org/docs/Troubleshooting.html#never-mutate-reducer-arguments)'].join(' ');

    function immutableStateInvariantMiddleware() {
      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var _options$isImmutable = options.isImmutable,
          isImmutable = _options$isImmutable === undefined ? _isImmutable2.default : _options$isImmutable,
          ignore = options.ignore;

      var track = _trackForMutations2.default.bind(null, isImmutable, ignore);

      return function (_ref) {
        var getState = _ref.getState;

        var state = getState();
        var tracker = track(state);

        var result = void 0;
        return function (next) {
          return function (action) {
            state = getState();

            result = tracker.detectMutations();
            // Track before potentially not meeting the invariant
            tracker = track(state);

            (0, _invariant2.default)(!result.wasMutated, BETWEEN_DISPATCHES_MESSAGE, (result.path || []).join('.'));

            var dispatchedAction = next(action);
            state = getState();

            result = tracker.detectMutations();
            // Track before potentially not meeting the invariant
            tracker = track(state);

            result.wasMutated && (0, _invariant2.default)(!result.wasMutated, INSIDE_DISPATCH_MESSAGE, (result.path || []).join('.'), (0, _jsonStringifySafe2.default)(action));

            return dispatchedAction;
          };
        };
      };
    }
    });

    var invariant$1 = unwrapExports(dist);

    let todoStore;
    {
        const composeEnhancers = reduxDevtoolsExtension_1(todoAction);
        todoStore = createStore(todoReducer, 
            composeEnhancers(applyMiddleware(invariant$1())));
    }

    var getTrackedState = () => i(todoStore);

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
    			add_location(span, file, 26, 109, 783);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file, 26, 8, 682);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file, 27, 8, 841);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file, 25, 6, 646);
    			attr_dev(input, "id", "msg");
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "form-control");
    			attr_dev(input, "name", "msg");
    			attr_dev(input, "placeholder", "Type todo here");
    			add_location(input, file, 31, 8, 953);
    			add_location(br, file, 32, 68, 1083);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file, 34, 8, 1122);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file, 29, 6, 902);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file, 37, 8, 1259);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file, 38, 8, 1353);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file, 36, 6, 1223);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file, 24, 4, 611);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file, 23, 2, 554);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "-1");
    			attr_dev(div5, "role", "dialog");
    			attr_dev(div5, "aria-labelledby", "myLargeModalLabel");
    			add_location(div5, file, 22, 0, 450);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[2], false, false, false),
    				listen_dev(input, "input", /*input_input_handler*/ ctx[5]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[6]),
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
    		i: noop,
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
    	const state = getTrackedState();
    	let addTodo = todoitem => state.dispatch(todoAction.addTodo({ ...todoitem }));
    	let todoitem = { todo: "", desc: "" };

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
    		if ("addTodo" in $$props) addTodo = $$props.addTodo;
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    	};

    	return [
    		todoitem,
    		addTodoHandler,
    		cancelHandler,
    		state,
    		addTodo,
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
    			h4.textContent = "Edit Todo --> Update";
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
    			add_location(span, file$1, 27, 109, 843);
    			attr_dev(button0, "type", "button");
    			attr_dev(button0, "class", "close");
    			attr_dev(button0, "data-dismiss", "modal");
    			attr_dev(button0, "aria-label", "Close");
    			add_location(button0, file$1, 27, 8, 742);
    			attr_dev(h4, "class", "modal-title");
    			add_location(h4, file$1, 28, 8, 901);
    			attr_dev(div0, "class", "modal-header");
    			add_location(div0, file$1, 26, 6, 706);
    			attr_dev(input0, "id", "no");
    			attr_dev(input0, "type", "text");
    			attr_dev(input0, "class", "form-control");
    			attr_dev(input0, "name", "no");
    			input0.disabled = true;
    			add_location(input0, file$1, 32, 8, 1021);
    			add_location(br0, file$1, 32, 100, 1113);
    			attr_dev(input1, "id", "todo");
    			attr_dev(input1, "type", "text");
    			attr_dev(input1, "class", "form-control");
    			attr_dev(input1, "name", "msg");
    			attr_dev(input1, "placeholder", "Type todo here");
    			add_location(input1, file$1, 34, 8, 1145);
    			add_location(br1, file$1, 35, 68, 1276);
    			attr_dev(textarea, "class", "form-control");
    			attr_dev(textarea, "rows", "3");
    			add_location(textarea, file$1, 37, 8, 1315);
    			attr_dev(input2, "type", "checkbox");
    			add_location(input2, file$1, 38, 15, 1410);
    			attr_dev(div1, "class", "modal-body");
    			add_location(div1, file$1, 30, 6, 972);
    			attr_dev(button1, "type", "button");
    			attr_dev(button1, "class", "btn btn-default");
    			add_location(button1, file$1, 41, 8, 1532);
    			attr_dev(button2, "type", "button");
    			attr_dev(button2, "class", "btn btn-primary");
    			attr_dev(button2, "data-dismiss", "modal");
    			add_location(button2, file$1, 42, 8, 1632);
    			attr_dev(div2, "class", "modal-footer");
    			add_location(div2, file$1, 40, 6, 1496);
    			attr_dev(div3, "class", "modal-content");
    			add_location(div3, file$1, 25, 4, 671);
    			attr_dev(div4, "class", "modal-dialog modal-lg");
    			attr_dev(div4, "role", "document");
    			add_location(div4, file$1, 24, 2, 614);
    			attr_dev(div5, "class", "centered-modal fade in");
    			attr_dev(div5, "tabindex", "0");
    			attr_dev(div5, "role", "dialog");
    			add_location(div5, file$1, 23, 0, 547);

    			dispose = [
    				listen_dev(button0, "click", /*cancelHandler*/ ctx[3], false, false, false),
    				listen_dev(input0, "input", /*input0_input_handler*/ ctx[7]),
    				listen_dev(input1, "input", /*input1_input_handler*/ ctx[8]),
    				listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[9]),
    				listen_dev(input2, "change", /*input2_change_handler*/ ctx[10]),
    				listen_dev(button1, "click", /*updateTodoHandler*/ ctx[2], false, false, false),
    				listen_dev(button2, "click", /*cancelHandler*/ ctx[3], false, false, false)
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
    		i: noop,
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
    	let $state;
    	const state = getTrackedState();
    	validate_store(state, "state");
    	component_subscribe($$self, state, value => $$invalidate(5, $state = value));
    	let updateTodo = todoitem => state.dispatch(todoAction.updateTodo({ ...todoitem }));
    	let { params = {} } = $$props;
    	let todoitem = $state.todolist.find(item => item.no === parseInt(params.no, 10));
    	if (!todoitem) push("/");

    	const updateTodoHandler = () => {
    		updateTodo(todoitem);
    		push("/");
    	};

    	const cancelHandler = () => push("/");
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
    		if ("params" in $$props) $$invalidate(4, params = $$props.params);
    	};

    	$$self.$capture_state = () => {
    		return { updateTodo, params, todoitem, $state };
    	};

    	$$self.$inject_state = $$props => {
    		if ("updateTodo" in $$props) updateTodo = $$props.updateTodo;
    		if ("params" in $$props) $$invalidate(4, params = $$props.params);
    		if ("todoitem" in $$props) $$invalidate(0, todoitem = $$props.todoitem);
    		if ("$state" in $$props) state.set($state = $$props.$state);
    	};

    	return [
    		todoitem,
    		state,
    		updateTodoHandler,
    		cancelHandler,
    		params,
    		$state,
    		updateTodo,
    		input0_input_handler,
    		input1_input_handler,
    		textarea_input_handler,
    		input2_change_handler
    	];
    }

    class UpdateTodo extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { params: 4 });

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

    const { console: console_1 } = globals;
    const file$2 = "src\\components\\TodoItem.svelte";

    // (29:8) {#if item.done}
    function create_if_block(ctx) {
    	let t;

    	const block = {
    		c: function create() {
    			t = text("(Done)");
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
    		source: "(29:8) {#if item.done}",
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
    			add_location(span0, file$2, 25, 4, 525);
    			attr_dev(span1, "class", "pull-right badge pointer");
    			add_location(span1, file$2, 32, 4, 717);
    			attr_dev(span2, "class", "pull-right badge pointer");
    			add_location(span2, file$2, 33, 4, 800);
    			attr_dev(li, "class", /*itemClassName*/ ctx[1]);
    			attr_dev(li, "title", li_title_value = "description : " + /*item*/ ctx[0].desc);
    			add_location(li, file$2, 24, 0, 456);

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

    			if (dirty & /*item*/ 1 && li_title_value !== (li_title_value = "description : " + /*item*/ ctx[0].desc)) {
    				attr_dev(li, "title", li_title_value);
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
    		console.log(item.no);
    		callbacks.deleteTodo(item.no);
    	};

    	const editTodo = () => {
    		push(`/update/${item.no}`);
    	};

    	let itemClassName;
    	const writable_props = ["item", "callbacks"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<TodoItem> was created with unknown prop '${key}'`);
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
    			console_1.warn("<TodoItem> was created without expected prop 'item'");
    		}

    		if (/*callbacks*/ ctx[5] === undefined && !("callbacks" in props)) {
    			console_1.warn("<TodoItem> was created without expected prop 'callbacks'");
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
    const file$3 = "src\\components\\TodoList.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (33:8) {#each $state.todolist as item (item.no)}
    function create_each_block(key_1, ctx) {
    	let first;
    	let current;

    	const todoitem = new TodoItem({
    			props: {
    				item: /*item*/ ctx[4],
    				callbacks: /*callbacks*/ ctx[2]
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
    			if (dirty & /*$state*/ 1) todoitem_changes.item = /*item*/ ctx[4];
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
    		source: "(33:8) {#each $state.todolist as item (item.no)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div5;
    	let div1;
    	let div0;
    	let t1;
    	let button;
    	let t3;
    	let div4;
    	let div3;
    	let div2;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let dispose;
    	let each_value = /*$state*/ ctx[0].todolist;
    	const get_key = ctx => /*item*/ ctx[4].no;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			div0.textContent = ":: Todolist App";
    			t1 = space();
    			button = element("button");
    			button.textContent = "Add Todo";
    			t3 = space();
    			div4 = element("div");
    			div3 = element("div");
    			div2 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div0, "class", "title");
    			add_location(div0, file$3, 24, 8, 529);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$3, 23, 4, 501);
    			attr_dev(button, "class", "btn btn-primary");
    			add_location(button, file$3, 28, 4, 611);
    			attr_dev(div2, "class", "row");
    			add_location(div2, file$3, 31, 8, 777);
    			attr_dev(div3, "class", "panel-body");
    			add_location(div3, file$3, 30, 4, 743);
    			attr_dev(div4, "class", "panel panel-default panel-borderless");
    			add_location(div4, file$3, 29, 4, 687);
    			attr_dev(div5, "class", "container");
    			add_location(div5, file$3, 22, 0, 472);
    			dispose = listen_dev(button, "click", /*goAddTodo*/ ctx[3], false, false, false);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div1);
    			append_dev(div1, div0);
    			append_dev(div5, t1);
    			append_dev(div5, button);
    			append_dev(div5, t3);
    			append_dev(div5, div4);
    			append_dev(div4, div3);
    			append_dev(div3, div2);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div2, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const each_value = /*$state*/ ctx[0].todolist;
    			group_outros();
    			each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div2, outro_and_destroy_block, create_each_block, null, get_each_context);
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
    			if (detaching) detach_dev(div5);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			dispose();
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
    	let $state;
    	const state = getTrackedState();
    	validate_store(state, "state");
    	component_subscribe($$self, state, value => $$invalidate(0, $state = value));

    	let callbacks = {
    		deleteTodo: no => state.dispatch(todoAction.deleteTodo(no)),
    		toggleDone: no => state.dispatch(todoAction.toggleDone(no))
    	};

    	let goAddTodo = () => {
    		push("/add");
    	};

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("callbacks" in $$props) $$invalidate(2, callbacks = $$props.callbacks);
    		if ("goAddTodo" in $$props) $$invalidate(3, goAddTodo = $$props.goAddTodo);
    		if ("$state" in $$props) state.set($state = $$props.$state);
    	};

    	return [$state, state, callbacks, goAddTodo];
    }

    class TodoList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TodoList",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    /* src\components\NotFound.svelte generated by Svelte v3.16.5 */

    const file$4 = "src\\components\\NotFound.svelte";

    function create_fragment$5(ctx) {
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
    			add_location(div0, file$4, 7, 8, 84);
    			attr_dev(div1, "class", "well");
    			add_location(div1, file$4, 6, 4, 56);
    			attr_dev(div2, "class", "container");
    			add_location(div2, file$4, 5, 0, 27);
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
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class NotFound extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "NotFound",
    			options,
    			id: create_fragment$5.name
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
    const file$5 = "src\\AppContainer.svelte";

    function create_fragment$6(ctx) {
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
    			add_location(div0, file$5, 6, 2, 113);
    			attr_dev(div1, "id", "root");
    			add_location(div1, file$5, 5, 0, 94);
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
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class AppContainer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AppContainer",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    const app = new AppContainer({
      target: document.getElementById("root")
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
