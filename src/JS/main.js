class GameManager {
    constructor() {
        this.display = new Display(this)
        this.input = new Input(this)
        this.input.lock()

        this.data = {}
        fetch("./DATA/map.json")
            .then(response => response.json())
            .then((json) => {
                this.data.map = json
                fetch("./DATA/items.json")
                    .then(response => response.json())
                    .then((json) => {
                        this.data.items = json
                        fetch("./DATA/info.json")
                            .then(response => response.json())
                            .then((json) => {
                                this.data.info = json
                                setTimeout(() => {
                                    this.onLoaded()
                                }, 1000)
                            });
                    });
            });
    }

    onLoaded() {
        let generator = new Generator(this.data.map, this.data.items, this)
        const {
            m,
            i
        } = generator.generate()
        this.map = m;
        this.items = i;
        this.effects = new Effects(this.data.info.effects, this)
        generator.pleaceItems(this.data.info.startItems, this.items, this.map)
        this.player = new Player(this.map[this.data.info.startId], [
            new Take(this),
            new Drop(this),
            new Use(this),
            new Teleport(this),
            new Vocabulary(this),
            new Gossip(this),
        ], this)
        new Intro(this.data.info.intro, this).run(() => {
            this.input.unlock()
            this.player.moveTo(this.map[this.data.info.startId])
        })

    }

}

class Intro {
    constructor(data, GM) {
        this.GM = GM
        this.locations = []
        for (let i = 0; i < data.locations.length; i++) {
            this.locations.push({
                location: new Location(data.locations[i], this.GM),
                time: data.locations[i].time
            })
        }
        this.music = new Audio(data.music)
    }

    run(callback) {
        this.music.play()
        this._run(callback)
    }

    _run(callback) {
        this.GM.player.moveTo(this.locations[0].location);
        this.GM.display.displayText("")
        this.GM.input.lock()
        this.GM.input.setValue("")
        const time = this.locations[0].time
        this.locations.splice(0, 1)
        if (this.locations.length > 0) {
            setTimeout(() => {
                    this._run(callback);
                },
                time)
        } else {
            setTimeout(() => {
                    callback()
                },
                time)
        }
    }
}

class Effects {
    constructor(data, GM) {
        this.GM = GM
        this.effects = []
        for (let i = 0; i < data.length; i++) {
            this.effects.push(new Require(data[i], this.GM));
        }
    }

    check() {
        for (let i = 0; i < this.effects.length; i++) {
            const obj = this.effects[i].valide()

            if (obj.info) {

                this.GM.map[obj.location].items.push(this.GM.items[obj.effect])

                if (obj.remove !== undefined && obj.remove.length > 0) {
                    for (let i = 0; i < obj.remove.length; i++) {
                        const location = this.GM.map[obj.remove[i].location]
                        const item = this.GM.items[obj.remove[i].item]
                        location.items = location.items.filter(i => i != item)
                    }
                }

                this.GM.player.display()
                this.GM.display.displayComunicate(obj.description)
                this.effects[i] = {
                    info: false
                }
            }
        }
    }
}

class Require {
    constructor(data, GM) {
        this.GM = GM
        this.require = data.require
        this.data = data
    }

    valide() {
        for (let i = 0; i < this.require.length; i++) {
            if (this.GM.map[this.require[i].location].items.filter(item => item.id === this.require[i].item).length === 0) {
                return {
                    info: false,
                    description: this.require[i].description
                }
            }
        }
        return {
            info: true,
            effect: this.data.effect,
            location: this.data.location,
            description: this.data.description,
            remove: this.data.remove
        }
    }
}

class Player {
    constructor(location, actions, GM) {
        this.GM = GM
        this.item = null
        this.location = location
        this.actions = actions
        this.display()
    }

    display() {
        this.GM.display.displayLocation(this.location, this)
        this.GM.display.clearComunicate()
    }

    moveTo(location) {
        this.location = location
        this.display()
        this.GM.input.unlock()
    }

    pickUp(item) {
        this.location.items = this.location.items.filter(i => i != item)
        this.item = item
    }

    action(str) {
        if (!this.location.action(str)) {
            for (let i = 0; i < this.actions.length; i++) {
                const {
                    info,
                    s
                } = this.actions[i].check(str)
                if (info) {
                    this.actions[i].execute(s)
                    return
                }
            }
            this.GM.display.displayComunicate("Try another word or V for vocabulary");
            setTimeout(() => {
                this.GM.display.clearComunicate()
            }, 2000)
        }
    }

    dropItem(item) {
        if (this.location.pleaceItem(item)) {
            this.item = null
            return true
        }
        return false
    }

    useItem(item) {
        const effect = this.GM.items[item.effect]
        if (effect.pickable) {
            this.item = effect
        } else {
            this.item = null
            this.location.pleaceItem(effect)
        }
    }

}


class Generator {
    constructor(map, items, GM) {
        this.map = map
        this.items = items
        this.GM = GM
    }

    generate() {
        return {
            m: this.generateMap(),
            i: this.generateItems()
        }
    }

    generateMap() {
        let map = []
        for (let i = 0; i < this.map.length; i++) {
            map.push(new Location(this.map[i], this.GM));
        }
        return map
    }

    generateItems() {
        let items = []
        for (let i = 0; i < this.items.length; i++) {
            items.push(new Item(this.items[i], this.GM));
        }
        return items
    }

    pleaceItems(data, items, locations) {
        for (let i = 0; i < data.length; i++) {
            locations[data[i].location].pleaceItem(items[data[i].item])
        }
    }
}

class Input {
    constructor(GM) {
        this.GM = GM
        this.inputHTML = document.getElementById('input')
        this.inputHTML.onkeydown = this.keydown.bind(this)
        this.inputHTML.oninput = this.oninput.bind(this)
        this.locked = true
        this.value = ""
        this.anyKey = null
    }

    setValue(value) {
        this.value = value
        this.inputHTML.value = this.value
    }

    keydown(e) {
        if (this.anyKey !== null) {
            this.anyKey()
            this.anyKey = null
            return
        }
        if (this.locked) {
            return
        }
        if (e.key === 'Enter') {
            this.GM.player.action(this.inputHTML.value.slice(this.value.length, this.inputHTML.value.length))
            this.inputHTML.value = this.value
        }
    }

    oninput(e) {
        if (this.locked || this.inputHTML.value.slice(0, this.value.length) !== this.value) {
            this.inputHTML.value = this.value
        } else {
            this.inputHTML.value = this.inputHTML.value.slice(0, this.value.length) + this.inputHTML.value.slice(this.value.length, this.inputHTML.value.length).toUpperCase()
        }
    }


    lock() {
        this.locked = true
        this.inputHTML.value = this.value
    }

    unlock() {
        this.locked = false
        this.inputHTML.value = this.value
    }
}

class Display {

    static DEFAULT_TIME = 2000

    constructor(GM) {
        this.GM = GM
        this.imgHTML = document.getElementById('image')
        this.textHTML = document.getElementById('text')
        this.titleHTML = document.getElementById('title')
        this.compassHTML = {
            n: document.getElementById('n'),
            s: document.getElementById('s'),
            e: document.getElementById('e'),
            w: document.getElementById('w')
        }
    }

    displayLocation(location, player) {
        this.titleHTML.innerText = location.text
        this.imgHTML.src = "IMG/" + location.img
        this.imgHTML.style.setProperty("--color", location.color)
        this.displayLocationText(location, player)
        this.displayCompass(location)
    }

    displayLocationText(location, player) {
        let str = ""
        str += "You can go " + location.getDirections().map((e) => e.values[0]).join(", ") + "\n"
        str += "You see " + (location.items.length === 0 ? "nothing" : location.items.map((e) => e.dispplayName).join(", ")) + "\n"
        str += "You can are carrying " + (player.item === null ? "nothing" : player.item.dispplayName) + "\n"
        this.textHTML.innerText = str
    }

    displayCompass(location) {
        for (let key in this.compassHTML) {
            if (location.getDirections().find((e) => e.values[1] === key.toLocaleUpperCase())) {
                this.compassHTML[key].style.opacity = 0
            } else {
                this.compassHTML[key].style.opacity = 1
            }
        }
    }


    displayComunicate(text, callback) {

        this.GM.input.lock()
        if (typeof text === 'string') {
            this.GM.input.setValue(text)
            setTimeout(() => {
                this.GM.display.clearComunicate()
                try {
                    callback()
                } catch (e) {
                    console.error(e)
                }
            }, Display.DEFAULT_TIME)
        } else if (Array.isArray(text)) {
            text = [...text]
            this.GM.input.setValue(text[0].text)
            setTimeout(() => {
                text.splice(0, 1)
                if (text.length > 0) {
                    this.displayComunicate(text, callback)
                } else {
                    this.GM.display.clearComunicate()
                    try {
                        callback()
                    } catch (e) {
                        console.error(e)
                    }
                }
            }, text[0].time === undefined ? Display.DEFAULT_TIME : text[0].time)

        } else {
            throw new Error("Invalid description")
        }

    }

    clearComunicate() {
        this.GM.input.unlock()
        this.GM.input.setValue("What now? ")
    }

    displayText(text) {
        this.textHTML.innerText = text
    }

    pressAnyKey(callback) {
        this.GM.input.lock()
        this.GM.input.setValue("Press any key to continue")
        this.GM.input.anyKey = callback
    }

}

class Location {
    constructor(data, GM) {
        this.GM = GM
        this.id = data.id
        this.img = data.img
        this.color = data.color
        this.text = data.description
        this.actions = []
        this.items = []
        this.generateActionsForDirections(data.directions)
    }

    generateActionsForDirections(data) {
        for (const key in Move.VALUES) {
            this.actions.push(new Move(key, this.GM, data[key.toLowerCase()]))
        }
    }

    pleaceItem(item) {
        if (item.pickable) {
            let count = 0
            for (let i = 0; i < this.items.length; i++) {
                if (this.items[i].pickable) {
                    count++
                }
            }
            if (count == 3) {
                return false
            }
        }
        this.items.push(item)
        return true
    }

    action(str) {
        for (let i = 0; i < this.actions.length; i++) {
            const {
                info,
                s
            } = this.actions[i].check(str)
            if (info) {
                this.actions[i].execute(s)
                return true
            }
        }
        return false
    }

    getDirections() {
        let tab = []
        for (let i = 0; i < this.actions.length; i++) {
            if (this.actions[i] instanceof Move) {
                if (this.actions[i].target !== undefined) {
                    tab.push(this.actions[i])
                }
            }
        }
        return tab
    }

    getItem(str) {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].name === str) {
                return this.items[i]
            }
        }
        return null
    }

}

class Action {
    constructor(values, GM) {
        if (!Array.isArray(values)) {
            values = [values]
        }
        this.values = values
        this.GM = GM
    }

    execute() {
        throw new Error("Not implemented")
    }

    check(str) {
        for (let i = 0; i < this.values.length; i++) {
            if (str === this.values[i]) {
                return {
                    info: true,
                    s: ""
                };
            }
        }
        return {
            info: false,
            s: ""
        };
    }
}

class Move extends Action {
    static VALUES = {
        N: "NORTH",
        S: "SOUTH",
        E: "EAST",
        W: "WEST"
    }

    static COMUNICATES = {
        N: "You are going north...",
        S: "You are going south...",
        E: "You are going east...",
        W: "You are going west..."
    }

    constructor(value, GM, data) {
        value = value.toUpperCase();
        if (!Move.VALUES[value]) {
            throw new Error("Invalid direction")
        }
        super([Move.VALUES[value], value], GM)

        if (data == undefined || typeof data === 'number') {
            this.target = data
        } else {
            this.target = data.location
            this.require = data.require
        }

    }


    valid() {
        if (this.require === undefined) {
            return {
                info: this.target !== undefined,
                description: "You can't go that way!"
            }
        } else {
            return new Require({
                require: this.require
            }, this.GM).valide()
        }
    }

    execute() {
        const {
            info,
            description
        } = this.valid()
        if (info) {
            this.GM.display.displayComunicate(Move.COMUNICATES[this.values[1]], () => {
                this.GM.player.moveTo(this.GM.map[this.target])
            })
        } else {
            this.GM.display.displayComunicate(description)
        }
    }
}

class Take extends Action {
    constructor(GM) {
        super(["TAKE", "PICK UP", "GET", "T"], GM)
    }

    check(str) {
        for (let i = 0; i < this.values.length; i++) {
            if (str.slice(0, this.values[i].length + 1) === this.values[i] + " ") {
                return {
                    info: true,
                    s: str.slice(this.values[i].length + 1)
                };
            }
        }
        return {
            info: false,
            s: ""
        };
    }

    execute(str) {
        if (this.GM.player.item !== null) {
            this.GM.display.displayComunicate("You are already carrying something!")
        } else {
            let item = this.GM.player.location.getItem(str)
            if (item !== null) {
                if (item.pickable) {
                    this.GM.player.pickUp(item)
                    this.GM.display.displayComunicate("You are taking " + item.dispplayName, () => {
                        this.GM.display.displayLocationText(this.GM.player.location, this.GM.player);
                    })
                } else {
                    this.GM.display.displayComunicate("You can't carry it!")
                }
            } else {
                this.GM.display.displayComunicate("There isn't anything like that here")
            }
        }
    }
}

class Drop extends Action {
    constructor(GM) {
        super(["DROP", "PUT DOWN", "PUT", "D"], GM)
    }

    check(str) {
        for (let i = 0; i < this.values.length; i++) {
            if (str.slice(0, this.values[i].length + 1) === this.values[i] + " ") {
                return {
                    info: true,
                    s: str.slice(this.values[i].length + 1)
                };
            }
            if (str === this.values[i]) {
                return {
                    info: true,
                    s: null
                };
            }
        }
        return {
            info: false,
            s: ""
        };
    }

    execute(str) {
        if (this.GM.player.item === null) {
            this.GM.display.displayComunicate("You are not carrying anything!")
        } else {
            let item = this.GM.player.item
            if (item.name === str || str === null) {
                if (this.GM.player.dropItem(item)) {
                    this.GM.display.displayComunicate("You are about to drop " + item.dispplayName, () => {
                        this.GM.display.displayLocationText(this.GM.player.location, this.GM.player);
                    })
                } else {
                    this.GM.display.displayComunicate("You can't store any more here!")
                }
            } else {
                this.GM.display.displayComunicate("You are about to drop!")
            }
        }
    }
}


class Use extends Action {
    constructor(GM) {
        super(["USE", "EAT", "DRINK", "U"], GM)
    }

    check(str) {
        for (let i = 0; i < this.values.length; i++) {
            if (str.slice(0, this.values[i].length + 1) === this.values[i] + " ") {
                return {
                    info: true,
                    s: str.slice(this.values[i].length + 1)
                };
            }
            if (str === this.values[i]) {
                return {
                    info: true,
                    s: null
                };
            }
        }
        return {
            info: false,
            s: ""
        };
    }

    execute(str) {
        if (this.GM.player.item === null) {
            this.GM.display.displayComunicate("You are not carrying anything!")
        } else {
            let item = this.GM.player.item
            if (item.win !== undefined) {
                this.GM.player.moveTo(this.GM.map[item.win.location])
                this.GM.input.setValue("")
                this.GM.display.displayText("")
                this.GM.input.lock()
                return
            }
            if (item.name === str || str === null) {
                if (item.canUse()) {
                    this.GM.player.useItem(item)
                    this.GM.display.displayComunicate(item.description, () => {
                        if (item.locationImg !== undefined) {
                            this.GM.player.location.img = item.locationImg
                        }
                        this.GM.player.display()
                        this.GM.effects.check()
                    })
                } else {
                    this.GM.display.displayComunicate("Nothing happened")
                }
            } else {
                this.GM.display.displayComunicate("You aren't carrying anything like that!")
            }
        }
    }
}

class Teleport extends Action {
    constructor(GM) {
        super(["TELEPORT", "TELE", "TP"], GM)
    }

    check(str) {
        for (let i = 0; i < this.values.length; i++) {
            if (str.slice(0, this.values[i].length + 1) === this.values[i] + " ") {
                return {
                    info: true,
                    s: str.slice(this.values[i].length + 1)
                };
            }
        }
        return {
            info: false,
            s: ""
        };
    }

    execute(str) {
        if (this.GM.map[str] !== undefined) {
            this.GM.player.moveTo(this.GM.map[str])
        } else {

        }
    }
}

class Vocabulary extends Action {

    static TEXT = `
        NORTH or N, SOUTH or S
        WEST or W, EAST or E
        TAKE (object) or T (object)
        DROP (object) or D (object)
        USE (object) or U (object)
        GOSSIPS or G, VOCABULARY or V
    `


    constructor(GM) {
        super(["VOCABULARY", "VOC", "VOCAB", "V"], GM)
    }

    execute() {
        this.GM.display.displayText(Vocabulary.TEXT)
        this.GM.display.pressAnyKey(() => {
            this.GM.player.display()
            this.GM.input.unlock()
        })
    }
}

class Gossip extends Action {

    static TEXT = `
        The  woodcutter lost  his home key...
		The butcher likes fruit... The cooper
		is greedy... Dratewka plans to make a
		poisoned  bait for the dragon...  The
		tavern owner is buying food  from the
		pickers... Making a rag from a bag...
    `

    constructor(GM) {
        super(["GOSSIP", "G"], GM)
    }

    execute() {
        this.GM.display.displayText(Gossip.TEXT)
        this.GM.display.pressAnyKey(() => {
            this.GM.player.display()
            this.GM.input.unlock()
        })
    }
}

class Item {
    constructor(data, GM) {
        this.GM = GM
        this.id = data.id
        this.name = data.name
        this.description = data.description
        this.dispplayName = data.dispplayName
        this.pickable = data.pickable
        this.effect = data.effect
        this.location = data.location
        this.require = data.require
        this.locationImg = data.locationImg
        this.win = data.win
    }

    canUse() {
        if (this.require !== undefined) {
            const {
                info
            } = new Require({
                require: this.require
            }, this.GM).valide()

            return info
        }
        return this.effect !== undefined && this.location === this.GM.player.location.id
    }
}


window.addEventListener('DOMContentLoaded', (event) => {
    window.GM = new GameManager()
});
