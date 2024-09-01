const { initMediaSoup, server } = require("./server");

initMediaSoup().then(() => {
    server.listen(8000, () => {
        console.log('Server is running on port 8000');
    });
});