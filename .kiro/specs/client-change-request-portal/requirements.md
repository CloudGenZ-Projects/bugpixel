# Requirements Document

## Introduction

The Client Change Request Portal is a web application that lets clients submit structured change requests against websites they own. After signing in, a client sees a dashboard of their previously submitted requests and can create a new request. Creating a request involves selecting one of the client's registered websites, opening that website (embedded or in a pop-up), navigating to the target page, selecting a specific on-page element and capturing an accompanying screenshot, and describing one or more changes (Add, Update, or Delete) with optional file attachments. A completed request becomes visible to the submitting client, the developer assigned to the associated website, and the administrator.

The portal supports three roles: Client, Developer, and Admin. Administrators register websites, associate each website with an owning client and an assigned developer, and manage accounts. This document defines the functional requirements for authentication, per-client scoping, website registration and assignment, request creation and element capture, change item authoring, submission, and role-based visibility.

## Glossary

- **Portal**: The Client Change Request Portal system as a whole.
- **Auth_Service**: The component responsible for authenticating users and establishing sessions.
- **Client**: A user role representing a customer who owns one or more Websites and submits Change Requests.
- **Developer**: A user role assigned to one or more Websites, responsible for acting on Change Requests for those Websites.
- **Admin**: A user role that manages accounts, registers Websites, and assigns Developers to Websites.
- **User**: Any authenticated account, regardless of role (Client, Developer, or Admin).
- **Website**: A registered site owned by a Client that can be the target of a Change Request. Each Website has a registered URL and a display mode preference.
- **Website_Registry**: The component that stores Websites and their associations to owning Clients and assigned Developers.
- **Change_Request**: A report submitted by a Client that contains one or more Change_Items and applies to a single Website. Also referred to as a "report".
- **Change_Item**: A single requested change within a Change_Request. Each Change_Item has a change type, description, captured element reference, screenshot, and optional attachments.
- **Change_Type**: The category of a Change_Item, one of Add, Update, or Delete.
- **Element_Capture**: The component that lets a Client select a specific HTML element on a Website page and records a reference to that element.
- **Element_Reference**: A stored identifier for a captured HTML element, such as a DOM selector, that identifies the element the Change_Item applies to.
- **Screenshot**: An image captured of the Website page at the time an element is captured, attached to a Change_Item.
- **Attachment**: An optional PDF or image file associated with a Change_Item.
- **Dashboard**: The view presented to a Client listing the Change_Requests the Client has submitted.
- **Display_Mode**: The manner in which a Website is opened for navigation, either embedded within the Portal or in a separate pop-up window.
- **Session**: An authenticated context established after a successful sign-in.

## Requirements

### Requirement 1: Authentication

**User Story:** As a User, I want to sign in with my credentials, so that I can access the features permitted for my role.

#### Acceptance Criteria

1. WHEN a User submits valid credentials, THE Auth_Service SHALL establish a Session for that User.
2. IF a User submits credentials that do not match a registered account, THEN THE Auth_Service SHALL deny access and return an authentication error message.
3. WHEN a Session is established, THE Auth_Service SHALL associate the Session with exactly one role of Client, Developer, or Admin.
4. WHILE no valid Session exists, THE Portal SHALL restrict access to the sign-in view only.
5. WHEN an authenticated User requests to sign out, THE Auth_Service SHALL terminate the Session.

### Requirement 2: Client Dashboard

**User Story:** As a Client, I want to see the change requests I have submitted, so that I can track their status.

#### Acceptance Criteria

1. WHEN a Client opens the Dashboard, THE Portal SHALL display the list of Change_Requests submitted by that Client.
2. THE Portal SHALL restrict the Dashboard list to Change_Requests owned by the signed-in Client.
3. WHEN a Client selects a Change_Request from the Dashboard, THE Portal SHALL display the Change_Items contained in that Change_Request.
4. WHERE a Client has submitted no Change_Requests, THE Portal SHALL display an empty-state message indicating that no Change_Requests exist.
5. THE Dashboard SHALL provide a control for the Client to create a new Change_Request.

### Requirement 3: Website Registration and Assignment

**User Story:** As an Admin, I want to register websites and associate each with an owning client and an assigned developer, so that requests are routed to the correct people.

#### Acceptance Criteria

1. WHEN an Admin registers a Website, THE Website_Registry SHALL record the Website URL, the owning Client, and the Display_Mode preference.
2. WHEN an Admin assigns a Developer to a Website, THE Website_Registry SHALL record the association between that Developer and that Website.
3. THE Website_Registry SHALL allow a single Client to own more than one Website.
4. IF an Admin attempts to register a Website without an owning Client, THEN THE Website_Registry SHALL reject the registration and return a validation error.
5. WHERE a Website has no assigned Developer, THE Portal SHALL make Change_Requests for that Website visible to Admin accounts only.

### Requirement 4: Website Selection for a New Request

**User Story:** As a Client, I want to choose which of my websites a change request applies to, so that the request targets the correct site.

#### Acceptance Criteria

1. WHEN a Client initiates a new Change_Request, THE Portal SHALL prompt the Client to select a Website.
2. THE Portal SHALL restrict the selectable Websites to those owned by the signed-in Client.
3. WHEN a Client selects a Website, THE Portal SHALL associate the new Change_Request with the selected Website.
4. IF the signed-in Client owns no Websites, THEN THE Portal SHALL display a message indicating that no Websites are available and SHALL prevent creation of a Change_Request.

### Requirement 5: Opening the Selected Website

**User Story:** As a Client, I want to open the selected website embedded or in a pop-up, so that I can navigate it to find the page I want to change.

#### Acceptance Criteria

1. WHEN a Client selects a Website configured for embedded Display_Mode, THE Portal SHALL open the Website within an embedded view inside the Portal.
2. WHEN a Client selects a Website configured for pop-up Display_Mode, THE Portal SHALL open the Website in a separate pop-up window.
3. WHILE a Website is open for a Change_Request, THE Portal SHALL allow the Client to navigate between pages of the Website.
4. IF the selected Website cannot be opened in the configured Display_Mode, THEN THE Portal SHALL notify the Client and offer the alternate Display_Mode.

### Requirement 6: Element Capture and Screenshot

**User Story:** As a Client, I want to select a specific element on the page and capture a screenshot, so that the developer knows exactly where the change applies.

#### Acceptance Criteria

1. WHEN a Client activates Element_Capture on a Website page, THE Element_Capture SHALL allow the Client to select a single HTML element on that page.
2. WHEN a Client selects an HTML element, THE Element_Capture SHALL record an Element_Reference for the selected element on the current Change_Item.
3. WHEN a Client selects an HTML element, THE Element_Capture SHALL capture a Screenshot of the current page and attach the Screenshot to the current Change_Item.
4. IF Element_Capture cannot record an Element_Reference for the current page, THEN THE Portal SHALL notify the Client and SHALL still allow the Client to attach a Screenshot to the Change_Item.

### Requirement 7: Authoring a Change Item

**User Story:** As a Client, I want to describe each change as Add, Update, or Delete with the relevant values, so that the developer understands what I need.

#### Acceptance Criteria

1. WHEN a Client begins authoring a Change_Item, THE Portal SHALL prompt the Client to select a Change_Type of Add, Update, or Delete and to enter a description.
2. WHERE the selected Change_Type is Add, THE Portal SHALL provide a single input field for the content the Client wants to add.
3. WHERE the selected Change_Type is Delete, THE Portal SHALL provide a single input field for the content the Client wants to remove.
4. WHERE the selected Change_Type is Update, THE Portal SHALL provide separate input fields for the current value and the updated value.
5. WHERE a Client chooses to attach files to a Change_Item, THE Portal SHALL accept PDF and image files as Attachments on that Change_Item.
6. IF a Client attempts to complete a Change_Item without a Change_Type or without a description, THEN THE Portal SHALL reject completion and return a validation message identifying the missing field.
7. WHEN a Client completes a Change_Item, THE Portal SHALL add the Change_Item to the current Change_Request.

### Requirement 8: Multiple Change Items and Submission

**User Story:** As a Client, I want to add several changes to one request and submit it when ready, so that related changes travel together.

#### Acceptance Criteria

1. WHILE a Change_Request is being authored, THE Portal SHALL allow the Client to add more than one Change_Item to the Change_Request.
2. IF a Client attempts to submit a Change_Request that contains no Change_Items, THEN THE Portal SHALL reject the submission and return a message indicating at least one Change_Item is required.
3. WHEN a Client submits a Change_Request, THE Portal SHALL record the Change_Request as submitted and associate it with the submitting Client and the selected Website.
4. WHEN a Change_Request is submitted, THE Portal SHALL prevent further modification of the Change_Items within that Change_Request by the Client.

### Requirement 9: Role-Based Visibility of Submitted Requests

**User Story:** As a Developer or Admin, I want submitted requests to appear on the correct accounts, so that the right people can act on them.

#### Acceptance Criteria

1. WHEN a Change_Request is submitted, THE Portal SHALL make the Change_Request visible to the submitting Client.
2. WHEN a Change_Request is submitted, THE Portal SHALL make the Change_Request visible to the Developer assigned to the associated Website.
3. WHEN a Change_Request is submitted, THE Portal SHALL make the Change_Request visible to Admin accounts.
4. THE Portal SHALL restrict a Developer's view of Change_Requests to those associated with Websites assigned to that Developer.
5. WHEN a Developer or Admin opens a submitted Change_Request, THE Portal SHALL display each Change_Item with its Change_Type, description, Element_Reference, Screenshot, and Attachments.
