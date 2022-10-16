const express = require('express');
const path = require('path');
const fs = require('fs');
const request = require('request');
const cors = require('cors');
const formidable = require('formidable');
const PDFDocument = require("pdfkit-table");


const eventEmitter = require('events').EventEmitter;
const myWriteEvent = new eventEmitter();

const app  = express();

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({extended: true}));

app.get('/', (req,res) => {
    res.sendFile(__dirname + '/index.html');
})

const generatePDF = () => {

    const orderJSON = require('./order.json');

    const lineItems = require('./line-items');
    
    const doc = new PDFDocument({ margin: 30, size: 'A4', bufferPages: true });

    doc.pipe(fs.createWriteStream('output.pdf'));

    // Get the total number of items
    //const lineItemsArr =  orderJSON.order.line_items;
    const lineItemsArr = lineItems;
    const totalLineItems = lineItemsArr.length;
    let tempLineItems = [];
    let itemImageCount = 1;
    let renderedImageCount = 0;
    let itemImageIndexes = [];

    const imageHeight = 208;
    const imageWidth = 220;
    const pageHeight = doc.page.height;
    let pageCount = 1;
    let totalNumberOfPages = 1;
    let isFirstPage = true;

    const minusTwo = (itemsLength) => {
        if(itemsLength >= 2){
            let tempVal = itemsLength - 2;
            totalNumberOfPages += 1;
            minusTwo(tempVal)
        }else if(itemsLength == 1){
            totalNumberOfPages += 1;
        }
    };

    if(lineItemsArr.length === 1){ 
        totalNumberOfPages = 1; 
    }
    else{
        const tempItemsLength = lineItemsArr.length;
        minusTwo(tempItemsLength) 
    }

    // Coordinates
    const coords = {x:30, y:30};

    // Fonts
    const boldFont = './fonts/MYRIADPRO-BOLD.OTF';
    const regularFont = './fonts/MYRIADPRO-REGULAR.OTF';

    // Helper methods
    const getNewCoordValue = (operationType, coordAxis, value) => {
        switch(operationType){
            case 'add':
                coords[coordAxis] = coords[coordAxis] + value;
                break;
            case 'subtract':
                coords[coordAxis] = coords[coordAxis] - value;
                break;
            default:
                break;
        }
        
        return coords[coordAxis];
    }

    const setFooterYCoordinate = () => {
        coords.y = pageHeight - 130;
    }

    //Function writes image section in generatedPDF
    const writeImageSection = (imagePath)=>{

        const download = (url, path, callback) => {
            request.head(url, (err, res, body) => {
              request(url)
                .pipe(fs.createWriteStream(path))
                .on('close', ()=>{
                    callback(path)
                })
            })
          }

          const renderImageSection = (imgPath, coordY) => {

            // Render the image
            doc
            .image(imgPath, 
            ((doc.page.width - 60) - imageWidth) / 2, 
            coordY,
            {
                height: imageHeight,
                align: 'center'
            });
            
            getNewCoordValue('add', 'y', imageHeight + 23.5);

            myWriteEvent.emit('write table data')
          }

          //Variables needed for the image download
          const tempArray = imagePath.split('.');
          const savePath = `images/image${renderedImageCount}.${tempArray[tempArray.length - 1]}`;
          
          //This section downloads the image
          download(imagePath, savePath, (imgPath) => {
            //console.log('✅ Done!')
            renderImageSection(imgPath, coords.y)
          })
  
    }

    const renderTable = () => {

        const tableData = tempLineItems[itemImageIndexes.slice(0,1)];
        
        const newTableData = {
            headers: ['Item', 'Product details', 'Quantity'],
            rows:[
                [tableData.title, tableData.name, tableData.quantity]
            ]
        }

        doc.table( newTableData, { 
            width: 400,
            height: 30,
            x: ((doc.page.width - 30) - 400) / 2,
            y: coords.y,
            align: 'center'
        }); 

        // this index variable is used to get the next line_items array
        //index += 1;
        itemImageCount -= 1;

        itemImageIndexes.shift();
        
        renderedImageCount  += 1;

        if(isFirstPage){
            
            getNewCoordValue('add', 'y', 10)
        
            isFirstPage = false                      

            myWriteEvent.emit('render footer')

        } else {
            // Checks if there is still a value in the itemImageIndexes array  
            if(itemImageIndexes.length > 0){
            
                myWriteEvent.emit('render next line item')
            
            }
            else{
               
                myWriteEvent.emit('render footer');

            }
        }

    }

    const renderFooter = (finalWrite = false) => {

        setFooterYCoordinate()

        // Render Horizontal Line
        doc.moveTo(30, coords.y ) // set the current point
        .lineTo(doc.page.width - 30, coords.y) // draw a line
        .stroke();
            
        getNewCoordValue('add', 'y', 10);

        doc
        .text('Thank you for shopping with us', 0, coords.y, { align: 'center' });
        
        getNewCoordValue('add', 'y', 20);
        
        doc
        .font(boldFont)
        .text('My BlanketShop', 0, coords.y, { align: 'center' })
        .font(regularFont)
        .text('6735 Knot Ave, Buena Park CA 90620, United states', 0, getNewCoordValue('add', 'y', 10), { align: 'center' })
        .text('care@myblanketshop.com', 0, getNewCoordValue('add', 'y', 10), { align: 'center' })
        .text('myblanketshop.com', 0, getNewCoordValue('add', 'y', 10), { align: 'center' })
        
        
        // Page number
        doc
        .font(boldFont)
        .fontSize(12)
        .text('Page ' + pageCount + ' of ' + totalNumberOfPages, 0, getNewCoordValue('add', 'y', 20), { align: 'center' })

        isFirstPage = false;

        if((!finalWrite) && (lineItemsArr.length > 0)){

            doc.addPage();

            doc.switchToPage(pageCount);
    
            pageCount += 1;  
        
            myWriteEvent.emit('write new page');
            
        } else {
            myWriteEvent.emit('done writing to pdf', doc)
        }
        
    }

    const renderLineItem = () => {
        
        if(isFirstPage){
            coords.y = ((doc.page.height) - (imageHeight + 53.5)) / 2;
            tempLineItems.push(lineItemsArr.shift());
            itemImageIndexes = [0];
            itemImageCount = 1;
        } else {
            
            getNewCoordValue('add', 'y', 60);
            if((itemImageIndexes.length === 0) && (itemImageCount === 0)){
                if( lineItemsArr.length >= 2){
                    tempLineItems = lineItemsArr.splice(0, 2); 
                    itemImageCount = 2;
                    itemImageIndexes = [0,1];
                    coords.y = (pageHeight - (((imageHeight + 53.5) * 2) + 10)) / 2;
                }
                else if( lineItemsArr.length === 1 ){
                    tempLineItems = [lineItemsArr.pop()];
                    itemImageCount = 1;
                    itemImageIndexes = [0];
                    coords.y = (pageHeight - (imageHeight + 53.5)) / 2;
                }
                else{
                    myWriteEvent.emit('render footer');
                    return;
                }
            }
            
        }

        doc
        .font(regularFont)
        .text(`Item ${renderedImageCount + 1} OF ${totalLineItems}`, 0, coords.y,{ align: 'center' });

        getNewCoordValue('add', 'y', 20 );

        const imagePath = tempLineItems[itemImageIndexes.slice(0,1)].properties[2].value;
        
        writeImageSection(imagePath);
        
    }

    myWriteEvent.on('write new page',() => {
        myWriteEvent.emit('write logo')
    })
    // Renders the logo
    myWriteEvent.on('write logo', () => {
        coords.y = 30;
        doc.image('images/logo1.png', (doc.page.width - 100) / 2, coords.y, {width:100}, {align: 'center'});

         // Order number
        (function(){
        
            coords.x = doc.page.width - 100; 
            getNewCoordValue('add', 'y', 30);
        
            doc
            .font(regularFont)
            .fontSize(10)
            .text(`Order ${orderJSON.order.name}`, coords.x, coords.y);
        
            const fullDate = new Date(orderJSON.order.created_at);
            const fullMonth = fullDate.toLocaleString('default', { month: 'long' });
            const day = fullDate.getDate();
            const year = fullDate.getFullYear();
        
            // Created at property
            doc
            .fontSize(10)
            .text(`${fullMonth} ${day}, ${year}`
            , getNewCoordValue('subtract', 'x', 24)
            , getNewCoordValue('add', 'y', 10));

            console.log('Coord before rendering line item', coords.y)
        
        })();
        
        if(isFirstPage){
            
            // Shipping address
            (function(){
                const { 
                    first_name,
                    last_name,
                    address1,
                    province,
                    city,
                    zip,
                    country
                } = orderJSON.order.shipping_address;
        
                coords.x = 30
                getNewCoordValue('add', 'y', 50)
        
                doc
                .font(boldFont)
                .fontSize(10)
                .text("SHIP TO", coords.x, coords.y)
        
                doc
                .font(regularFont)
                .text(`${first_name} ${last_name.charAt(0)}`, coords.x, getNewCoordValue('add', 'y', 20))
                .text(`${address1}`, coords.x, getNewCoordValue('add', 'y', 10))
                .text(`${province} ${city} ${zip}`, coords.x, getNewCoordValue('add', 'y', 10))
                .text(`${country}`);
            })();
        
            // Billing address
            (function(){
                const { 
                    first_name,
                    last_name,
                    address1,
                    province,
                    city,
                    zip,
                    country
                } = orderJSON.order.billing_address;
        
                coords.y = 120
                coords.x = 268
        
                doc
                .font(boldFont)
                .text("BILL TO", coords.x, coords.y)
        
                doc
                .font('Helvetica')
                .text(`${first_name} ${last_name.charAt(0)}`, coords.x, getNewCoordValue('add', 'y', 20))
                .text(`${address1}`, coords.x, getNewCoordValue('add', 'y', 10))
                .text(`${province} ${city} ${zip}`, coords.x, getNewCoordValue('add', 'y', 10))
                .text(`${country}`, coords.x, getNewCoordValue('add', 'y', 10));
        
            })();

            //Horizontal line and Line Items text
            (() => {

                    getNewCoordValue('add', 'y', 20);

                    doc
                    .moveTo(30, coords.y) // set the current point
                    .lineTo(doc.page.width - 30, coords.y) // draw a line
                    .stroke();
                
                    doc
                    .font(boldFont)
                    .text('Line Items', 30, getNewCoordValue('add', 'y', 30));
                    
                }
            )();

        }

        // Emits event to render next line item
        myWriteEvent.emit('render next line item')
    })

    //Renders the footer
    myWriteEvent.on('render footer', () => renderFooter())

    // Render the table and calls write footer once page end is reached
    myWriteEvent.on('write table data', () => {
        renderTable()
    })

    // Triggers the write of a new item 
    myWriteEvent.on('render next line item', () => renderLineItem())
    
    // Closes the writing of data into pdf file
    myWriteEvent.on('done writing to pdf', (doc) => setTimeout(() => {
        //console.log('Closing file write');
        doc.end()
    }, 1000))

    // Emits event to write a new page
    myWriteEvent.emit('write new page')
}

generatePDF();

app.post('/uploads', (req, res) => {
    const form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
      var oldpath = files.file.filepath;
      var newpath = path.join(__dirname, './order.json');

      fs.rename(oldpath, newpath, function (err) {
        if (err) throw err;
        res.write('File uploaded and moved!');
        
        generatePDF();
        
        res.end();
      });
    })
});

app.listen(3000, () => {
    console.log('Server is running');
})