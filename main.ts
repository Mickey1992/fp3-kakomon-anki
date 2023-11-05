import puppeteer, { Page } from "puppeteer-core"
import https from 'https';
import fs from 'fs';
import fsPromise from 'fs/promises'

const QUESTIONS_PER_YEAR = 25;
const WEBSITE_HOST = "https://www.db-siken.com";
const IMAGE_NAME_PREFIX = "db_shiken_am2";
const OUTPUT_FILE_NAME = "db_shiken_am2_anki.tsv"

async function main() {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto('https://www.db-siken.com/dbkakomon.php');

        const numberOfQuestions = await page.$$eval('#tab1 > label', (labels, num) => labels.length * num, QUESTIONS_PER_YEAR);
        await clickSubmit(page);

        let questionNo = 0;
        while(questionNo < numberOfQuestions) {
                questionNo = await page.$eval(".qno", qno => Number.parseInt(qno.textContent!.slice(2)));
                console.log(questionNo + "/" + numberOfQuestions);

                let [question] = await getCardHTML(page, ".qno ~ div");
                let [selections, explanation] = await getCardHTML(page, ".ansbg");
                let [answer] = await getCardHTML(page, "#answerChar");

                await outputToFile(question, selections, answer, explanation);
                await clickSubmit(page);
        }
        await browser.close();
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
            res.pipe(fs.createWriteStream(imageName))
                .on('error', reject)
                .once('close', resolve);
        });
    });
}

async function getCardHTML(page: Page, selector: string): Promise<string[]> {  
        let currentImageUrls = await page.$$eval(
                selector + " img", 
                imgTags => imgTags.map(imgTag => imgTag.getAttribute("src")));
        
        const urlReplaceMap = new Map();
        currentImageUrls.forEach(async imgUrl => {
                let newUrl = imgUrl!.slice(1);
                let fileName = IMAGE_NAME_PREFIX + newUrl.split("/").join("_");
                urlReplaceMap.set(imgUrl, fileName);
                await downloadImage(WEBSITE_HOST + newUrl, fileName);
        });

        let cardHtmls = await page.$$eval(selector, elements => {
                return elements.map(element => element.innerHTML)});
        
        return cardHtmls.map(cardHtml => {
                for(let[oldUrl, newUrl] of urlReplaceMap) {
                        cardHtml = cardHtml.replace(oldUrl, newUrl);
                }

                return cardHtml;
        });
}

function wrapContent(content: string, className: string): string {
        return `<div class="${className}">${content}</div>`;
}

async function outputToFile(question: string, choice: string, answer: string, explanation: string) {
        const content = wrapContent(question, "question") + '\t' + 
                        wrapContent(choice, "choice") + '\t' + 
                        wrapContent(answer, "answer") + '\t' +
                        wrapContent(explanation, "explanation") + '\n'
        await fsPromise.writeFile(OUTPUT_FILE_NAME, content, { flag: 'a+' });
}

/*
    url: 
            https://www.db-siken.com/dbkakomon.php
    number of questions: document.querySelectorAll('#tab1 > label').length * 25
    start-button:
            document.querySelector(".submit")
    quesation_no:
            document.querySelector(".qno")
    question:
            document.querySelector(".qno ~ div")
    choice:
            document.querySelector("#select_a")
            document.querySelector("#select_i")
            document.querySelector("#select_u")
            document.querySelector("#select_e")
    answer:
            document.querySelector("#answerChar")
    explanation:
            document.querySelectorAll(".ansbg")[1]
    next-button:
            document.querySelector(".submit")
*/

main();


