// @ts-check

// Script run within the webview itself.
(function () {

	// Get a reference to the VS Code webview api.
	// We use this API to post messages back to our extension.

	// @ts-ignore
	const vscode = acquireVsCodeApi();


	const notesContainer = /** @type {HTMLElement} */ (document.querySelector('.notes'));

	notesContainer.querySelector('textarea').addEventListener('keyup', (e) => {
        if (e.keyCode === 13 && e.shiftKey) {
            vscode.postMessage({
                type: 'run',
				input: notesContainer.querySelector('textarea').value,
				output: notesContainer.querySelector('textarea').nextElementSibling.id
            });
        }
	})

	const errorContainer = document.createElement('div');
	document.body.appendChild(errorContainer);
	errorContainer.className = 'error'
	errorContainer.style.display = 'none'

	/**
	 * Render the document in the webview.
	 */
	function updateContent(/** @type {string} */ text) {
		notesContainer.innerHTML = text;
		notesContainer.querySelector('textarea').addEventListener('keyup', (e) => {
			if (e.keyCode === 13 && e.shiftKey) {
				var target = e.target || e.srcElement;
				notesContainer.querySelector('textarea').nextSibling.textContent = '';
				vscode.postMessage({
					type: 'run',
					input: notesContainer.querySelector('textarea').id,
					output: notesContainer.querySelector('textarea').nextElementSibling.id
				});
			}
		})
	}

	// Handle messages sent from the extension to the webview
	window.addEventListener('message', event => {
		const message = event.data; // The json data that the extension sent
		switch (message.type) {
			case 'update':
				const text = message.text;

				// Update our webview's content
				updateContent(text);

				// Then persist state information.
				// This state is returned in the call to `vscode.getState` below when a webview is reloaded.
				vscode.setState({ text });

				return;
		}
	});

	// Webviews are normally torn down when not visible and re-created when they become visible again.
	// State lets us save information across these re-loads
	const state = vscode.getState();
	if (state) {
		updateContent(state.text);
	}
}());