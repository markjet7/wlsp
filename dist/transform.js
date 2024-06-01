"use strict";
// transform wolfram expressions to d3.js expressions
// transform.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.processArray = void 0;
const d3 = require("d3");
function processArray(array, parentSelection = undefined) {
    const tag = array[0];
    const children = array.slice(1);
    let selection;
    if (!parentSelection) {
        parentSelection = d3.select('svg');
    }
    if (!parentSelection) {
        console.error('No parent selection found');
        return;
    }
    switch (tag) {
        case 'Graphics':
            selection = createGraphics(parentSelection);
            break;
        case 'Disk':
            selection = createDisk(parentSelection, children);
            break;
        case 'List':
            selection = createList(parentSelection, children);
            break;
        default:
            break;
    }
    children.forEach((child) => {
        if (Array.isArray(child) && typeof child[0] === 'string') {
            processArray(child, selection);
        }
    });
    return selection;
}
exports.processArray = processArray;
function createGraphics(parentSelection) {
    return parentSelection.append('g').attr('class', 'graphics');
}
function createDisk(parentSelection, children) {
    try {
        const selection = parentSelection.append('circle')
            .attr('class', 'disk')
            .attr('cx', children[0][1])
            .attr('cy', children[0][2])
            .attr('r', children[2]);
        return selection;
    }
    catch (error) {
        console.log('Error: ', error);
        const selection = parentSelection.append('circle')
            .attr('class', 'disk')
            .attr('cx', 100)
            .attr('cy', 100)
            .attr('r', 10);
        return selection;
    }
}
function createList(parentSelection, children) {
    // Process the list items
    const selection = parentSelection;
    // Append text elements for each list item
    children.forEach((child, index) => {
        if (typeof child === 'string') {
            selection.append('text')
                .attr('class', 'list-item')
                .attr('x', 0)
                .attr('y', index * 20)
                .text(child);
        }
        if (typeof child === 'number') {
            selection.append('text')
                .attr('class', 'list-item')
                .attr('x', 0)
                .attr('y', index * 20)
                .text(child);
        }
        // check if child is a nested array
        if (Array.isArray(child) && typeof child[0] === 'string') {
            processArray(child, selection);
        }
    });
    return selection;
}
//# sourceMappingURL=transform.js.map