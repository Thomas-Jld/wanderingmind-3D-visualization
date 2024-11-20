


export let loadImageData = (imageSrc, array) => {
    // Create a new image object
    const image = new Image();

    // Set up the image load event
    image.onload = function() {
        // Create a canvas
        const canvas = document.createElement('canvas');
        canvas.hidden = true;
        const context = canvas.getContext('2d');

        // Set the canvas size to the image size
        canvas.width = image.width;
        canvas.height = image.height;

        // Draw the image onto the canvas
        context.drawImage(image, 0, 0);

        // Get the image data
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        // Extract the grayscale values
        for (let i = 0; i < imageData.data.length; i += 4) {
            array.push(imageData.data[i]);
        }
    };

    // Handle possible errors when loading an image
    image.onerror = function() {
    console.error('There was an error loading the image.');
    };

    //  Set the image source to start the loading process
    image.src = imageSrc;
}
