# Requirements Document

## Introduction

The Change Request Portal is a web application that allows clients to submit visual change requests against websites they own. Because all client websites are built and hosted by the portal owner, an inspector/component-picker script is injected directly into the client sites, gated behind an authenticated owner session. After logging in, a client sees a dashboard of their submitted change requests and can compose new requests by opening one of their websites, navigating to the relevant page, selecting an on-page component with an inspector, capturing a screenshot with a highlighted region, and describing one or more desired changes (Add, Update, or Delete) with optional file attachments. Submitted requests are routed to the client, the assigned developer, and the admin. The system supports three roles: Client, Developer, and Admin. Admins manage the roster of developers and assign developers to projects/websites.

## Glossary

- **Portal**: The Change Request Portal web application that provides authentication, dashboards, website selection, the inspector experience, request composition, and submission routing.
- **Client**: An authenticated user who owns one or more Websites and submits Change Requests.
- **Developer**: An authenticated user who receives and works on Change Requests for Websites to which the Developer is assigned.
- **Admin**: An authenticated user who manages the Developer roster and assigns Developers to Projects.
- **User**: Any authenticated actor of the Portal (Client, Developer, or Admin).
- **Website**: A site built and hosted by the portal owner and owned by a specific Client. A Client may own multiple Websites.
- **Project**: The unit of work associated with a Website to which Developers are assigned by an Admin. Each Website belongs to exactly one Project.
- **Inspector**: The component-picker script injected into a Website that allows an authenticated owning Client to select an on-page HTML component and trigger screenshot capture.
- **Owner_Session**: The authenticated session of the Client that owns the Website being inspected, required to enable the Inspector.
- **Change_Request**: A submitted report composed of one or more Change_Items against a single Website. Also referred to as a report.
- **Change_Item**: A single requested change within a Change_Request, of type Add, Update, or Delete, including a description, an associated selected component reference, a screenshot, and optional attachments.
- **Change_Type**: The category of a Change_Item: Add, Update, or Delete.
- **Component_Reference**: The recorded identifier of the selected on-page component. A screenshot with a highlighted region is the required capture; selector/HTML metadata is optional.
- **Screenshot**: An image of the Website page captured at component selection time, including a highlighted region indicating the selected component.
- **Attachment**: An optional PDF or image file added to an Add or Update Change_Item.
- **Dashboard**: The authenticated landing view listing Change_Requests relevant to the current User's role.
- **Website_Open_View**: The popup window or embedded frame in which a selected Website is opened for navigation and inspection.
- **Assignment**: An Admin-managed association between a Developer and a Project.

## Requirements

### Requirement 1: Client Authentication

**User Story:** As a Client, I want to log in with my credentials, so that I can access my change requests and submit new ones securely.

#### Acceptance Criteria

1. WHEN a Client submits valid credentials, THE Portal SHALL establish an authenticated Owner_Session for that Client.
2. IF a Client submits invalid credentials, THEN THE Portal SHALL reject the login attempt and return an authentication error message.
3. WHILE a Client has no valid authenticated session, THE Portal SHALL deny access to the Dashboard and redirect the Client to the login view.
4. WHEN an authenticated Client requests to log out, THE Portal SHALL terminate the Client's session and redirect the Client to the login view.
5. WHILE a Client session is idle for 30 minutes, THE Portal SHALL invalidate the session and require re-authentication for subsequent protected actions.

### Requirement 2: Role-Based Authorization

**User Story:** As the portal owner, I want each User restricted to the actions and data appropriate for their role, so that Clients, Developers, and Admins only access what they are permitted to.

#### Acceptance Criteria

1. THE Portal SHALL assign each User exactly one role from the set {Client, Developer, Admin}.
2. WHEN an authenticated User accesses the Dashboard, THE Portal SHALL present the view corresponding to the User's assigned role.
3. IF a User requests an action not permitted for the User's assigned role, THEN THE Portal SHALL deny the action and return an authorization error.
4. WHERE a User holds the Admin role, THE Portal SHALL grant access to Developer roster management and Assignment management.
5. IF an unauthenticated request targets any protected resource, THEN THE Portal SHALL deny the request and return an authentication error.

### Requirement 3: Client Dashboard

**User Story:** As a Client, I want to see all change requests I have submitted, so that I can track their status and history.

#### Acceptance Criteria

1. WHEN an authenticated Client opens the Dashboard, THE Portal SHALL display the list of Change_Requests submitted by that Client.
2. THE Portal SHALL restrict the Client's Dashboard list to Change_Requests owned by the requesting Client.
3. WHEN an authenticated Client selects a Change_Request from the Dashboard, THE Portal SHALL display the Change_Items contained in that Change_Request.
4. WHERE the authenticated Client has submitted no Change_Requests, THE Portal SHALL display an empty-state indication and a control to create a new Change_Request.
5. WHEN an authenticated Client selects the New control, THE Portal SHALL prompt the Client to choose a Website.

### Requirement 4: Website Ownership and Selection

**User Story:** As a Client, I want to choose from only the websites I own when starting a request, so that I cannot submit changes against websites that are not mine.

#### Acceptance Criteria

1. WHEN a Client is prompted to choose a Website, THE Portal SHALL present only the Websites owned by that Client.
2. IF a Client requests to open a Website not owned by that Client, THEN THE Portal SHALL deny the request and return an authorization error.
3. WHEN a Client selects an owned Website, THE Portal SHALL open the selected Website in the Website_Open_View.
4. WHERE a Client owns multiple Websites, THE Portal SHALL allow the Client to select exactly one Website per Change_Request.

### Requirement 5: Website Open Experience

**User Story:** As a Client, I want to open my website in a resizable popup or embedded view, so that I can navigate to the page where I want to request a change.

#### Acceptance Criteria

1. WHEN a Client opens a selected Website, THE Portal SHALL present the Website in a Website_Open_View as either a resizable popup window or an embedded frame.
2. WHERE the Website_Open_View is a popup window, THE Portal SHALL allow the Client to resize and adjust the dimensions of the popup window.
3. WHILE the Website_Open_View is active, THE Portal SHALL allow the Client to navigate across pages of the opened Website.
4. WHILE the Website_Open_View is active, THE Portal SHALL associate the current Change_Request composition with the selected Website.

### Requirement 6: Gated Component Inspector

**User Story:** As a Client, I want an inspect-element tool available only to me on my own website, so that I can select the specific component I want changed without exposing this tool to the public.

#### Acceptance Criteria

1. WHILE an Owner_Session for the opened Website is active, THE Portal SHALL enable the Inspector within the Website_Open_View.
2. IF the Inspector is requested without an active Owner_Session for the opened Website, THEN THE Portal SHALL deny activation of the Inspector, present an indication that activation was denied due to a missing authenticated owning-Client session, and leave the Website_Open_View unchanged.
3. WHEN a Client selects an on-page component using the Inspector, THE Portal SHALL record a Component_Reference that includes a screenshot of the opened Website and the highlighted region identifying the selected component.
4. WHERE selector or HTML metadata for the selected component is available, THE Portal SHALL store that metadata as optional data on the Component_Reference.
5. THE Portal SHALL restrict Inspector activation to the authenticated owning Client of the opened Website.
6. WHEN an active Owner_Session for the opened Website ends or expires while the Inspector is enabled, THE Portal SHALL deactivate the Inspector within the Website_Open_View.

### Requirement 7: Screenshot Capture

**User Story:** As a Client, I want a screenshot with the selected component highlighted, so that the developer can see exactly what I want changed.

#### Acceptance Criteria

1. WHEN a Client selects an on-page component using the Inspector, THE Portal SHALL capture a Screenshot of the Website page in parallel with recording the Component_Reference.
2. THE Portal SHALL include a highlighted region indicating the selected component within the captured Screenshot.
3. THE Portal SHALL attach the captured Screenshot to the Change_Item being composed.
4. IF Screenshot capture fails, THEN THE Portal SHALL notify the Client that the capture failed and allow the Client to retry the component selection.

### Requirement 8: Change Item Composition

**User Story:** As a Client, I want to describe each change as Add, Update, or Delete with the right input fields, so that I can express precisely what I want done.

#### Acceptance Criteria

1. WHEN a Client confirms a component selection, THE Portal SHALL prompt the Client to choose a Change_Type from the set {Add, Update, Delete} and to enter a description of 1 to 2000 characters.
2. WHERE the chosen Change_Type is Add, THE Portal SHALL present a single input field of 1 to 2000 characters for the content the Client wants to add.
3. WHERE the chosen Change_Type is Delete, THE Portal SHALL present a single input field of 1 to 2000 characters for the content the Client wants to remove.
4. WHERE the chosen Change_Type is Update, THE Portal SHALL present a current-value field and an updated-value field, each of 1 to 2000 characters.
5. IF a Client attempts to save a Change_Item with an empty or whitespace-only description, THEN THE Portal SHALL reject the save, retain the entered values, and return a validation error identifying the missing description.
6. IF a Client attempts to save a Change_Item with an empty or whitespace-only required content field for the chosen Change_Type, THEN THE Portal SHALL reject the save, retain the entered values, and return a validation error identifying the missing content field.
7. WHERE the chosen Change_Type is Add or Update, THE Portal SHALL allow the Client to attach PDF or image Attachments to the Change_Item.
8. WHERE the chosen Change_Type is Delete, THE Portal SHALL omit the Attachment control from the Change_Item form.
9. WHEN a Client selects Done for a Change_Item whose description and required content fields are populated, THE Portal SHALL add the Change_Item to the current Change_Request and retain the association with the recorded Component_Reference and Screenshot.

### Requirement 9: Change Item Attachments

**User Story:** As a Client, I want to attach PDFs or images to an Add or Update change, so that I can provide supporting materials for the requested change.

#### Acceptance Criteria

1. WHERE the chosen Change_Type is Add or Update, THE Portal SHALL allow the Client to attach one or more Attachments to the Change_Item.
2. THE Portal SHALL accept Attachments only of type PDF or image.
3. IF a Client attaches a file of an unsupported type, THEN THE Portal SHALL reject the Attachment and return a validation error identifying the unsupported type.
4. IF a Client attaches a file exceeding 10 megabytes, THEN THE Portal SHALL reject the Attachment and return a validation error identifying the size limit.
5. WHERE the chosen Change_Type is Delete, THE Portal SHALL omit the Attachment control from the Change_Item form.

### Requirement 10: Multi-Change Report Composition

**User Story:** As a Client, I want to add multiple changes to a single report before submitting, so that I can batch related changes together.

#### Acceptance Criteria

1. WHILE composing a Change_Request, THE Portal SHALL allow the Client to add multiple Change_Items to the same Change_Request.
2. WHEN a Client adds a Change_Item and chooses to continue, THE Portal SHALL allow the Client to select another component within the same opened Website and compose an additional Change_Item.
3. THE Portal SHALL associate all Change_Items in a single Change_Request with the same selected Website.
4. WHILE a Change_Request contains no Change_Items, THE Portal SHALL disable the Submit control.

### Requirement 11: Report Submission and Routing

**User Story:** As a Client, I want to submit a completed report and have it reach the right people, so that the assigned developer and admin can act on it.

#### Acceptance Criteria

1. WHEN a Client selects Submit for a Change_Request containing at least one Change_Item and at most 500 Change_Items, THE Portal SHALL persist the Change_Request, set its status to Submitted, and record the submission timestamp within 3 seconds.
2. WHEN a Change_Request status is set to Submitted, THE Portal SHALL make the Change_Request visible on the submitting Client's account with a status indicator of Submitted.
3. WHEN a Change_Request status is set to Submitted and a Developer is assigned to the Project of the associated Website, THE Portal SHALL make the Change_Request visible to that assigned Developer with a status indicator of Submitted.
4. WHEN a Change_Request status is set to Submitted, THE Portal SHALL make the Change_Request visible on the Admin account with a status indicator of Submitted.
5. IF a Client selects Submit for a Change_Request containing zero Change_Items, THEN THE Portal SHALL reject the submission, leave the Change_Request status unchanged, and return a validation error indicating that at least one Change_Item is required.
6. WHERE no Developer is assigned to the Project of the associated Website when a Change_Request status is set to Submitted, THE Portal SHALL make the Change_Request visible to the Admin account and set its status to Awaiting Developer Assignment.
7. IF persisting a submitted Change_Request fails, THEN THE Portal SHALL leave the Change_Request status unchanged, discard any partial persistence, and return an error indicating that the submission could not be completed.

### Requirement 12: Developer Change Request Visibility

**User Story:** As a Developer, I want to see the change requests for websites assigned to me, so that I can work on the requested changes.

#### Acceptance Criteria

1. WHEN an authenticated Developer opens the Dashboard, THE Portal SHALL display the Change_Requests for Projects to which the Developer is assigned.
2. THE Portal SHALL restrict the Developer's Change_Request list to Projects for which the Developer holds an active Assignment.
3. WHEN an authenticated Developer selects a Change_Request, THE Portal SHALL display the Change_Items, Component_References, Screenshots, and Attachments contained in that Change_Request.

### Requirement 13: Admin Developer Roster Management

**User Story:** As an Admin, I want to manage the list of developers, so that I control who can be assigned to projects.

#### Acceptance Criteria

1. WHEN an Admin adds a Developer to the roster, THE Portal SHALL create a Developer record and include it in the roster.
2. WHEN an Admin removes a Developer from the roster, THE Portal SHALL remove the Developer from the roster and remove the Developer's active Assignments.
3. WHEN an Admin views the roster, THE Portal SHALL display all Developers currently in the roster.
4. IF an Admin adds a Developer whose identifier already exists in the roster, THEN THE Portal SHALL reject the addition and return a validation error identifying the duplicate.

### Requirement 14: Admin Project Assignment

**User Story:** As an Admin, I want to assign developers to projects and websites, so that submitted change requests are routed to the correct developer.

#### Acceptance Criteria

1. WHEN an Admin assigns a Developer to a Project, THE Portal SHALL create an Assignment associating that Developer with that Project.
2. WHEN an Admin removes an Assignment, THE Portal SHALL remove the association between the Developer and the Project.
3. WHEN an Admin changes the Developer assigned to a Project, THE Portal SHALL replace the prior Assignment with the new Assignment for that Project.
4. WHEN a Change_Request is submitted for a Website whose Project has an active Assignment, THE Portal SHALL route the Change_Request to the Developer named in that Assignment.
5. IF an Admin assigns a Developer who is not in the roster, THEN THE Portal SHALL reject the Assignment and return a validation error.

### Requirement 15: Security Against Unauthorized and Public Use

**User Story:** As the portal owner, I want the inspector and submission flow protected from anonymous and unauthorized use, so that only owning clients can create change requests against their sites.

#### Acceptance Criteria

1. IF an anonymous visitor of a Website requests to activate the Inspector, THEN THE Portal SHALL deny activation of the Inspector.
2. THE Portal SHALL require an authenticated Owner_Session for the opened Website as a precondition for recording a Component_Reference or capturing a Screenshot.
3. IF a request to create or submit a Change_Request lacks an authenticated session, THEN THE Portal SHALL deny the request and return an authentication error.
4. IF an authenticated Client attempts to create or submit a Change_Request for a Website not owned by that Client, THEN THE Portal SHALL deny the request and return an authorization error.
5. THE Portal SHALL transmit authentication credentials and session tokens over encrypted connections.
