import puppeteer, { Page } from "puppeteer-core";
import https from "https";
import fs, { symlinkSync } from "fs";
import fsPromise from "fs/promises";
import { setTimeout } from "timers/promises";

const WEBSITE_HOST = "https://fp3-siken.com";
const ENTRY_GAKKA_SHIKEN = "https://fp3-siken.com/kakomon.php";
const ENTRY_JITSUGI_SHIKEN = "https://fp3-siken.com/kakomon_j.php";
const IMAGE_NAME_PREFIX = " fp3_shiken_";
const OUTPUT_FOLDER = "./output/";
const OUTPUT_FILE_NAME_PREFIX = "fp3_shiken_";
const OUTPUT_FILE_EXT = "tsv";
const JITSUGI_SUBJECT_MAP = new Map([
	["金財・個人", "kojin"],
	["金財・生保", "seiho"],
	["FP協会", "fp"],
]);

async function main() {
	//  remove all files
	if (fs.existsSync(OUTPUT_FOLDER)) {
		fs.rmdirSync(OUTPUT_FOLDER, { recursive: true });
	}

	//  学科
	console.log("[学科]");
	await crawlCardRecords(ENTRY_GAKKA_SHIKEN, "gakka");

	//  実技
	console.log("[実技・FP協会]");
	await crawlCardRecords(
		ENTRY_JITSUGI_SHIKEN,
		"jitsugi",
		JITSUGI_SUBJECT_MAP.get("FP協会")
	);
}

async function crawlCardRecords(url: string, type: string, subject?: string) {
	const browser = await puppeteer.launch({
		headless: false,
		executablePath:
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
	});

	const page = await browser.newPage();
	await page.goto(url);

	if (subject) await selectSubject(page, subject);
	await clickSubmit(page);

	const numberOfQuestions = await page.$eval(".grayText", (text) => {
		let index = text.textContent!.lastIndexOf("／") + 6;
		return Number.parseInt(text.textContent!.slice(index));
	});

	console.log(numberOfQuestions);

	let questionNo = 0;

	while (questionNo++ < numberOfQuestions) {
		console.log(questionNo + "/" + numberOfQuestions);

		let [question] = await getCardHTML(page, ".mondai", type);
		let [buttons] = await getCardHTML(page, ".selectBtn", type);
		let [explanation] = await getCardHTML(page, ".kaisetsu", type);
		let [answer] = await getCardHTML(page, ".answerChar", type);
		let catelog = await getCatelog(page, ".content>a");
		let examTime = getExamTime(question);

		await outputToFile(
			type,
			question,
			buttons,
			answer,
			explanation,
			catelog,
			examTime
		);
		await setTimeout(1000);
		await clickSubmit(page);
	}
	await browser.close();
}

async function clickSubmit(page: Page) {
	await Promise.all([
		page.waitForNavigation({ timeout: 100000 }),
		page.click(".submit"),
	]);
}

async function selectSubject(page: Page, value: string) {
	await page.$eval(`input[value="${value}"]`, (element) =>
		element.parentElement?.click()
	);
}

function downloadImage(url: string, imageName: string, type: string) {
	const outputFolder = OUTPUT_FOLDER + type + "/";
	const outputFileName = outputFolder + imageName;

	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			res.pipe(fs.createWriteStream(outputFileName))
				.on("error", reject)
				.once("close", resolve);
		});
	});
}

async function getCatelog(page: Page, selector: string): Promise<string> {
	let elements = await page.$$eval(selector, (elements) =>
		elements.map((element) => element.textContent)
	);
	return elements.slice(1).join(">");
}
async function createImgPathReplaceMap(
	page: Page,
	selector: string,
	type: string
): Promise<Map<string, string>> {
	let currentImageUrls = await page.$$eval(selector + " img", (imgTags) =>
		imgTags.map((imgTag) => imgTag.getAttribute("src"))
	);

	let urlReplaceMap = new Map();
	currentImageUrls.forEach(async (imgUrl) => {
		let newUrl = imgUrl!.slice(1);
		let fileName = IMAGE_NAME_PREFIX + type + newUrl.split("/").join("_");
		urlReplaceMap.set(imgUrl, fileName);
		await downloadImage(WEBSITE_HOST + newUrl, fileName, type);
	});
	return urlReplaceMap;
}
async function getCardHTML(
	page: Page,
	selector: string,
	type: string
): Promise<string[]> {
	let urlReplaceMap = await createImgPathReplaceMap(page, selector, type);
	let cardHtmls = await page.$$eval(selector, (elements) => {
		elements.forEach((element) => {
			element.querySelector("h3")?.remove();

			let grayTextElement = element.querySelector(".grayText")!;
			if (grayTextElement) {
				grayTextElement.innerHTML = grayTextElement.innerHTML.replace(
					/\d+問目\／選択問題数\d+問/,
					""
				);
			}
		});
		// remove text: 1問目／選択問題数2810問
		return elements.map((element) => element.outerHTML.replace(/\n+/, ""));
	});

	return cardHtmls.map((cardHtml) => {
		for (let [oldUrl, newUrl] of urlReplaceMap) {
			cardHtml = cardHtml.replace(oldUrl, newUrl);
		}
		return cardHtml;
	});
}

function wrapContent(content: string, className: string): string {
	return `<div class="${className}">${content}</div>`;
}

async function outputToFile(
	type: String,
	question: string,
	choice: string,
	answer: string,
	explanation: string,
	catelog: string,
	examTime: string
) {
	const outputFolder = OUTPUT_FOLDER + type + "/";
	const outputFileName =
		outputFolder + OUTPUT_FILE_NAME_PREFIX + type + "." + OUTPUT_FILE_EXT;
	const content =
		wrapContent(question, "question") +
		"\t" +
		wrapContent(choice, "choice") +
		"\t" +
		wrapContent(answer, "answer") +
		"\t" +
		wrapContent(explanation, "explanation") +
		"\t" +
		catelog +
		"\t" +
		examTime +
		"\n";

	fs.mkdirSync(outputFolder, { recursive: true });

	await fsPromise.writeFile(outputFileName, content, { flag: "a+" });
}

function getExamTime(text: string) {
	const regex = /(\d{4})年(\d+)月.*/;
	const match = text.match(regex);
	const yyyymm = match![1] + ("0" + match![2]).slice(-2);
	return yyyymm;
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
