# Assignment: Full-Stack Web Development for AI Application in Cybersecurity Scenarios

**Weight:** 45% of your total marks for the unit  
**Due Date:** Sunday, Week 12  

---

## Assignment Description

In this final assignment, students will develop a full-stack web application that integrates the AI model created in Assignment 2. Using React.js for the front end and FastAPI for the back end, students will build an application that allows users to input data, processes the input using the AI model on the server side, and displays the results through interactive visualizations on the front-end.

As the culminating assignment of the course, this project carries the largest weight in the final grade. It will test students’ ability to integrate front-end and back-end technologies, handle data efficiently, and deliver clear visualizations of the AI model’s output.

In this assignment, students are expected to demonstrate proficiency in the following areas:

* **Full-Stack Web Development:** Implement a complete web application using React.js for the user interface and FastAPI for server-side processing. The front end must capture user inputs, and the back end must handle the AI model’s processing and return the prediction results.
* **AI Model Integration:** Connect the AI model to the FastAPI back-end, enabling real-time predictions based on user input data. This will involve passing data between the front-end and back-end and efficiently processing it with the AI model.
* **Data Visualization:** Use React.js along with visualization libraries like D3.js, Chart.js, or Plotly.js to present the AI model’s predictions. Ensure the visualizations are dynamic and provide clear, meaningful insights into the model’s output. At least two types of charts must be included.
* **Error Handling and Input Validation:** Ensure robust error handling and input validation in both the front-end and back-end. The front end should validate user inputs before sending them to the server, and the back end must handle any errors gracefully, providing appropriate feedback to the user.

### Project Focus Areas
Depending on the AI model’s topic, students’ applications might focus on one of the following areas:
1. **Misinformation Detection on Social Media:** Detect misinformation on social media platforms. Collect real-world social media data, extract useful features (like text content and user behaviour), and train models to identify false or misleading posts.
2. **Spam or Malware Detection:** Detect spam messages or potential malware threats. Work with datasets containing emails, messages, or files, extract relevant features, and build models to classify harmful content.
3. **Detecting Software Vulnerabilities:** Detect security vulnerabilities in software code. Analyse source code to identify patterns that may lead to bugs or exploits, and train models to automatically flag risky code. 
4. **Network Traffic Classification for Anomaly Detection:** Classify network traffic and detect unusual or potentially malicious activity. Analyse network data, extract features (e.g., packet size, timing), and train models to distinguish normal behaviour from anomalies.
5. **Cybersecurity Threat Detection in Banking:** Covers a range of cybersecurity problems in the banking sector (e.g., fraud detection, identity theft, etc.). Improve system security in this critical sector using AI engineering.

---

## 1. Project Description

The project involves developing a comprehensive machine-learning solution that integrates project management, design elements, and technical implementation to address real-world challenges. Students will work in teams to complete the project in three phases: creating a detailed project management plan, implementing a machine learning model, and developing a dynamic website to showcase their results.

The Machine Learning Web Application aims to deliver an interactive platform for users to engage with machine learning models and visualize data insights. The primary goal is to demonstrate practical machine learning applications in real-world scenarios, enhancing user interaction and understanding of the underlying models.

**Core Functional Requirements for the whole project:**
* Select a project topic and find relevant datasets suitable for the chosen topic.
* Investigate and analyze the topic, using machine learning techniques for prediction, attribution, or classification to gain a better understanding and response to the topic.
* Develop a website application that allows users to interact with trained models and provides corresponding responses based on user inputs.
* Include data visualization features to help users understand the dataset.

---

## 2. Overview of the Tasks

### 1. Front-End Development (React.js):
* Create a user input form with appropriate validation mechanisms.
* Implement at least two types of data visualization charts using D3.js, Chart.js, or Plotly.js (three charts for HD-level work).
* Design a user-friendly, responsive interface.
* Ensure seamless interaction with the back-end API for data submission and retrieval.
* Apply UI/UX principles to enhance usability and aesthetics.

### 2. Back-End Development (FastAPI):
* Set up a FastAPI server and define necessary routes (using at least two HTTP methods: GET, PUT, POST, or DELETE).
* Integrate the AI model from Assignment 2 for prediction processing.
* Develop API endpoints for handling user data and returning model predictions.
* Implement robust error handling and exception management for stable operation.

### 3. AI Model Integration:
* Ensure efficient execution of the AI model on the server.
* Implement data preprocessing and postprocessing logic to handle inputs and outputs.

### 4. Documentation:
* Write a comprehensive README file with instructions for setup and running the application.
* Prepare a comprehensive project report that covers all aspects of the system, including the system architecture, implementation details, introduction, and API documentation.
    * The implementation details should provide a clear explanation of how the front-end and back-end components are developed, how the AI model is integrated, and any key design decisions made. Include descriptions of data preprocessing, postprocessing, error handling, and validation techniques.

> **Note for High Distinction (HD):** Students must include additional features such as at least three types of charts, interactive visualizations, and at least three advanced functionalities. Examples include:
> * **Enhanced Visualizations:** At least three chart types with interactive features (e.g., zoom, filtering) using D3.js or Plotly.js.
> * **Real-Time Updates:** Integrate live data feeds or auto-refreshing charts.
> * **Custom User Input:** Advanced input forms with comprehensive validation and dynamic feedback.
> * **Error Handling:** Robust error handling with clear messages on both ends.
> * **UX Enhancements:** Export functionality for predictions and visualizations, etc.

---

## 3. Deliverables

Your submission should contain the following:

### 1. Project Report (PDF)
* **Size:** No more than 8 pages (excluding cover page, table of contents, bibliography, and appendix).
* **Project Title:** Title of your full-stack web application project (on the cover page).
* **Group Information:** Group name and ID, student names and IDs, tutor’s name (on the cover page).
* **System Architecture:** Describe the overall architecture (front-end, back-end, AI model).
* **Front-End Implementation:** Describe key features (user input form, data visualization, validation) and explain how data is sent to the back-end (e.g., Axios).
* **Back-End Implementation:** Explain the FastAPI server setup and provide API endpoint documentation (request type, JSON response, etc.).
* **AI Model Integration:** Recap the AI model from Assignment 2. Explain its integration and any modifications for web deployment.
* **Conclusion:** Explain how the solution addresses the real-world issue, identify areas for improvement, and outline future enhancements.
* **Bibliography:** Harvard style.
* **Appendix:** Additional files/info if necessary.

### 2. Source Code (ZIP file)
* **Front-End:** React.js code (exclude `node_modules`).
* **Back-End:** FastAPI code (must include the AI model code used in the web app, with any modifications).
* **README File:** Markdown (`.md`) or PDF. Provide setup instructions, necessary libraries, running instructions for front/back-end, and configuration steps for AI model integration.

### 3. Demonstration Video (MP4 or AVI, Max 7 minutes)
* **Content:**
    * Showcase FULL functionality of the web application.
    * Demonstrate all user interactions (clickable buttons, input fields).
    * Show responsiveness on desktop, tablet, and mobile devices.
    * Walk through the entire workflow (user input -> data processing -> result visualization).
    * Explain key technical decisions and challenges.
* **YouTube Option:** If file size exceeds Canvas limits, upload as an *unlisted* YouTube video. Include the link on the cover page of your report AND in a separate text file named `group-name-video-link.txt`.
* **Important:** If the video is inaccessible at grading time, you will receive zero marks for most components.

### 4. Meeting Minutes (PDF)
* Hold at least one meeting each week since the team's inception and submit all meeting minutes. 

### 5. Contribution Form (PDF)
* Includes personal info of each team member, details of contribution, etc.

---

## 4. Submission Instructions

* Submit via the “Assignment 3 Submission” link on Canvas by the deadline. 
* No hard copy submission is required. 
* Only one student per group needs to submit all documents.
* **File Naming:** Use your group name, e.g., `session-xx-group-1-AssignmentName.pdf`. Marks may be deducted for incorrect naming. 
* Submissions via email will not be accepted.

**Late Penalties:** 10% deduction of the available mark per calendar day (or part thereof) for up to one week. Submissions more than 7 calendar days late receive a zero (0).

---

## 5. Marking Criteria & Important Notes

* Acknowledge all statements/information taken from other sources. Adhere to plagiarism guidelines.
* Diagrams/tables adapted from other sources must be cited (Harvard style).
* **Do not publicly post** any part of your work or reasoning on Canvas discussions.
* **Generative AI Tools:** Must *not* be used to generate content for this assignment. However, their use for learning, idea generation, or debugging support is permitted. You are responsible for understanding, writing, and explaining all core logic. Copying entire functions constitutes plagiarism. All AI use must be acknowledged in your report.

---

## COS30049 Assignment 3 Rubric (Total: 45 Pts)

| Criteria | Full Points | Partial Points | Zero Points | Max Pts |
| :--- | :--- | :--- | :--- | :--- |
| **Report: 1) Formatting & Referencing** | **(1 Pts)** Clear/professional title, group/student info on cover page. Well-organized formatting (layout, font, spacing). References cited in Harvard style. | **(0.5 Pts)** Basic info provided but formatting issues exist. References cited but with significant Harvard style errors. | **(0 Pts)** Missing/incomplete info, poor formatting. References missing or not Harvard style. | **1** |
| **Report: 2) System Architecture & Implementation** | **(2 Pts)** Detailed/clear explanation of architecture. Implementation details thoroughly described with technology justifications. Includes clear diagrams/flowcharts. | **(1 Pts)** Basic description. Some components poorly explained. Vague implementation details, unjustified tech choices. Diagrams are basic/missing. | **(0 Pts)** Architecture poorly described/missing. Implementation details vague/incorrect. No tech choice explanations or diagrams. | **2** |
| **Report: 3) API Endpoint Documentation** | **(2 Pts)** All API endpoints clearly documented (request types, parameters, JSON structures, examples). Well-organized and easy to follow. | **(1 Pts)** Some endpoints documented, but key details (parameters, structure, examples) are unclear/missing. Lacks organization. | **(0 Pts)** API documentation is missing, incomplete, or contains critical errors. | **2** |
| **Source Code: 1) Execution** | **(2 Pts)** Executes flawlessly without errors/warnings. All features (frontend, backend, AI) run smoothly. Starts quickly, responds well. Dependencies correctly managed. | **(1 Pts)** Executes with non-critical errors/warnings. Some features may not work as expected, but core functionality is operational. Noticeable delays or minor dependency issues. | **(0 Pts)** Significant execution problems. Critical errors prevent core features from working. Fails to start, crashes, serious dependency conflicts. | **2** |
| **Source Code: 2) Comments** | **(1 Pts)** Thoroughly commented. Significant sections have clear/informative comments explaining purpose/functionality. Enhances readability. | **(0.5 Pts)** Comments present but brief/vague. Key functionality not always explained. | **(0 Pts)** Minimal/no comments. Sections lack explanation, leading to difficulties understanding the code. | **1** |
| **Source Code: 3) Code Structure** | **(2 Pts)** Clean, well-organized, follows best practices. Logically organized program files with clear hierarchy. Modular code (functions/classes clearly separated). | **(1 Pts)** Generally organized but has structure issues. Mostly well-structured but might have redundancies or lack clear module separation. | **(0 Pts)** Poorly structured, disorganized layout. Difficult to navigate, inconsistent structuring. | **2** |
| **Functionality: 1) AI Model Integration** | **(3 Pts)** Seamlessly integrated, provides real-time predictions, and handles various input types effectively. | **(1.5 Pts)** Integrated, but issues exist with data flow/prediction. Functions correctly but with performance/latency issues. | **(0 Pts)** AI model integration is non-functional or missing. | **3** |
| **Functionality: 2) Frontend/Backend Comms** | **(4 Pts)** Smooth/error-free communication. Data transferred efficiently (GET, POST). Responds promptly. Fully functional data retrieval/submission. | **(2 Pts)** Works, but occasional delays or significant errors. Some interactions need speed/reliability improvement. | **(0 Pts)** Comms non-functional or severely broken. Data not transferred correctly. | **4** |
| **Functionality: 3) Error Handling & Input Validation** | **(3 Pts)** Comprehensive handling/validation across front/back-end. All inputs validated, errors handled gracefully with clear messages. Prevents invalid data. | **(1.5 Pts)** Basic handling/validation, but edge cases missed. Error messages unclear. Some invalid inputs pass through. | **(0 Pts)** Minimal/no error handling or validation. Allows invalid data. Errors not caught or handled poorly. | **3** |
| **Functionality: 4) Backend API Design** | **(4 Pts)** Well-designed API, RESTful principles, efficient endpoints. ≥2 HTTP methods used appropriately. Efficiently handles requests/responses. Well-documented/reliable. | **(2 Pts)** Functional but has noticeable design issues/inefficiencies. HTTP methods used incorrectly or endpoints not fully RESTful. Minimal documentation. | **(0 Pts)** Poorly designed, incorrect/missing endpoints. Fails RESTful principles. Incomplete/missing documentation. | **4** |
| **Functionality: 5) Real-time Updates & Responsiveness** | **(4 Pts)** Smooth, real-time updates with immediate responsiveness. Elements/visualizations update dynamically without delay. Maintains performance across devices. | **(2 Pts)** Functional but inconsistent. Noticeable delays. Elements may not update smoothly. Performance issues across devices. | **(0 Pts)** Lacks real-time updates/unresponsive. Significant delays, crashes, or elements don't update at all. | **4** |
| **Visualization: 1) Chart Diversity & Relevance** | **(3 Pts)** Includes multiple (≥3) diverse chart types highly relevant to the data. Effectively communicates AI insights clearly. | **(1.5 Pts)** Includes some variety, but lacks diversity or relevance. Communicates data, but not as effectively. | **(0 Pts)** Lacks diversity, irrelevant/poorly suited charts. Fails to communicate predictions/insights. | **3** |
| **Visualization: 2) Interactivity** | **(4 Pts)** Highly interactive (zoom, filtering, tooltips, real-time updates). Interactions are smooth and enhance UX. | **(2 Pts)** Visually appealing but limited interactivity. Not fully interactive but well-presented and visually clear. | **(0 Pts)** Lacks interactivity (no zoom/filtering/tooltips). Static, visually unappealing charts. | **4** |
| **Visualization: 3) Data Representation Clarity** | **(2 Pts)** Clear/accurate representation. Predictions easy to understand. Highlights key insights well-labeled (legends, titles, units). | **(1 Pts)** Generally clear, but some aspects confusing/lack detail. Labels/legends present but not fully informative. | **(0 Pts)** Unclear, confusing/poorly labeled. Difficult to interpret, key insights lost. | **2** |
| **Visualization: 4) Performance & Loading** | **(2 Pts)** Visualizations load quickly and perform smoothly, even with large datasets. | **(1 Pts)** Acceptable loading times and performance with occasional issues. | **(0 Pts)** Slow loading times or poor performance of visualizations. | **2** |
| **Usability: 1) User Interface (UI)** | **(3 Pts)** Highly polished, advanced design (responsive layouts, intuitive navigation, appealing elements). Advanced components (modals, dynamic forms, custom animations). | **(1.5 Pts)** Functional/visually satisfactory but lacks advanced features. Navigation intuitive, but design is basic/plain in areas. | **(0 Pts)** Poorly designed/non-functional. Visually unappealing, difficult to navigate, lacks consistency. | **3** |
| **Usability: 2) User Experience (UX)** | **(3 Pts)** Highly refined, seamless/intuitive experience. Advanced features (feedback mechanisms, personalized interactions, smooth transitions) enhance engagement. | **(1.5 Pts)** Generally good UX, straightforward interactions. Feels basic or lacks features that enhance engagement beyond standard expectations. | **(0 Pts)** Poor UX, confusing navigation, unintuitive interactions. Difficult to use, lacks consideration for user needs. | **3** |