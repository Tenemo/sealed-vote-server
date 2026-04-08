/* global document, window */

if (window.MSCompatibleInfo) {
    const error =
        'Internet Explorer is not supported. Please use a modern browser instead.';
    document.documentElement.innerHTML = error;
    throw new Error(error);
}
