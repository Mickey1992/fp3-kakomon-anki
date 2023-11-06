import puppeteer, { Page } from "puppeteer-core"
import https from 'https';
import fs from 'fs';
import fsPromise from 'fs/promises'

const QUESTIONS_PER_YEAR = 25;
const WEBSITE_HOST = "https://fp3-siken.com";
const ENTRY_GAKKA_SHIKEN = "https://fp3-siken.com/kakomon.php"
const IMAGE_NAME_PREFIX = " fp3_shiken_gakka";
const OUTPUT_FOLDER = "./output/"
const OUTPUT_FILE_NAME = OUTPUT_FOLDER + "fp3_shiken_gakka_anki.tsv"
async function main() {
        const browser = await puppeteer.launch({executablePath: "/Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge", headless: false});
        const page = await browser.newPage();
        await page.goto(ENTRY_GAKKA_SHIKEN);

        await clickSubmit(page);
        const numberOfQuestions = 1;
        //const numberOfQuestions = await page.$eval('.grayText', text => {
        //     let index = text.textContent!.lastIndexOf("／") + 6;
        //     return Number.parseInt(text.textContent!.slice(index));
        // });

        console.log(numberOfQuestions);

        let questionNo = 0;

        while(questionNo++ < numberOfQuestions) {
                console.log(questionNo + "/" + numberOfQuestions);

                let [question] = await getCardHTML(page, ".mondai");
                let [buttons] = await getCardHTML(page, ".selectBtn");
                let [explanation] = await getCardHTML(page, ".kaisetsu");
                let [answer] = await getCardHTML(page, ".answerChar");

                let catelog = await getCatelog(page, ".content>a");

                await outputToFile(question, buttons, answer, explanation, catelog);
                await clickSubmit(page);
        }
        // await browser.close();
}

async function clickSubmit(page: Page) {
    await Promise.all([
    page.waitForNavigation(),
    page.click('.submit'),
    ]);
}

function downloadImage(url: string, imageName: string) {
    return new Promise((resolve, reject) => {
            https.get(url, res => {
            res.pipe(fs.createWriteStream(OUTPUT_FOLDER + imageName))
                .on('error', reject)
                .once('close', resolve);
        });
    });
}

async function getCatelog(page: Page, selector: string): Promise<string> {
    let elements = await page.$$eval(selector, elements => elements.map(element => element.textContent));
    return elements.slice(1).join(">");
}
async function createImgPathReplaceMap(page: Page, selector: string): Promise<Map<string, string>> {
        let currentImageUrls = await page.$$eval(
                selector + " img", 
                imgTags => imgTags.map(imgTag => imgTag.getAttribute("src")));
        
        let urlReplaceMap = new Map();
        currentImageUrls.forEach(async imgUrl => {
                let newUrl = imgUrl!.slice(1);
                let fileName = IMAGE_NAME_PREFIX + newUrl.split("/").join("_");
                urlReplaceMap.set(imgUrl, fileName);
                await downloadImage(WEBSITE_HOST + newUrl, fileName);
        });
        return urlReplaceMap
} 
async function getCardHTML(page: Page, selector: string): Promise<string[]> {      
        console.info('a1')
        let urlReplaceMap = await createImgPathReplaceMap(page, selector);    
        console.info('a2')
        let cardHtmls = await page.$$eval(selector, elements => {
        console.info('a3')
                elements.forEach(element => {
                        console.info('abc')
                }) ;
                //1問目／選択問題数2810問
                return elements.map(element => element.outerHTML.replace(/\d+問目\／選択問題数\d+問/, ""));
            });

        return cardHtmls.map(cardHtml => {
                for(let[oldUrl, newUrl] of urlReplaceMap) {
                        cardHtml = cardHtml.replace(oldUrl, newUrl);
                }
                // console.log(cardHtml);
                return cardHtml;
        });
}

function wrapContent(content: string, className: string): string {
        return `<div class="${className}">${content}</div>`;
}

async function outputToFile(question: string, choice: string, answer: string, explanation: string, catelog: string) {
        const content = wrapContent(question, "question") + '\t' + 
                        wrapContent(choice, "choice") + '\t' + 
                        wrapContent(answer, "answer") + '\t' +
                        wrapContent(answer, "explanation") + '\t' +
                        catelog + '\n'
        await fsPromise.writeFile(OUTPUT_FILE_NAME, content, { flag: 'a+' });
}

/*
    url: 
            https://fp3-siken.com/kakomon.php
            https://fp3-siken.com/kakomon_j.php
    number of questions: document.querySelector(".grayText").textContent
            '2021年9月試験　学科 問461問目／選択問題数2810問'
    start-button:
            document.querySelector(".submit")
    quesation_no:
            document.querySelector("h3")
    question:
            document.querySelector(".mondai")
    choice:
            document.querySelector(".mondai ol")
            document.querySelector(".selectBtn").outerHTML
    answer:
            document.querySelector(".answerChar").textContent
    explanation:
            document.querySelector(".kaisetsu").innerHTML
    next-button:
            document.querySelector(".submit")
    catelog:
            document.querySelectorAll(".content>a").textContent 

*/

main();





