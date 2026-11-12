# The Grill-Execute-Clear Loop

- About item 11, do you think we should only show a question list on the page or show all the content for each question by default? I am thinking about if a question has many replies, it could be very long and make the page cumbersome to navigate even we have a limit of 20 questions per page.

- Do you think we can put list and detail in one page? Go to the question detail won't navigate to a new page but change the content of the comment section. In the comment section users can navigate between list and detail. The navigation should be supported by route changes. I don't really like a new page just for detail but without the lesson content since users could possibly lose the context. If a new page for detail is easy to implement in the first version, I think it would be good to show the lesson content, or partially at least. What's on your mind?

- About item 15, you said "show an unread badge in navigation". Can you explain where users can see this badge in the navigation? Shall it show on the homepage or somewhere? Your words didn't explain it very clear.

- Notification list will take the main section of the page but not shown as a sub-list of Notifications, right? I think it would be good to use main section but not a sub-list of Notifications. This follows the same behavior as the rest of the sidebar.

  When all the notifications are read, the unread badge should disappear.

  BTW, it would be good to update seed to include unread notifications.

  For instructors, do you mean Discussion inbox will replace notifications?

- With this design above, content in Discussion inbox would always include content in Notifications. Don't you think so?

- It would be better to keep Notifications and Discussion inbox separate.

  For students, it only has Notifications.

  For instructors, it has both Notifications and Discussion inbox. Notifications will hold replies to the instructor's questions where the instructor is enrolled as a student for that course. Discussion inbox is dedicated to questions and replies from students in the instructor's courses.

  Hope this makes sense. Do you like this approach and think it is feasible to implement?

- For item 14 do you think hidden content should be only invisible for students but not for instructors and admin?

- I want to confirm some behaviors you talked about:

  - Checking unread counts is to check if there are any unread notifications
  - Marking activity as read marks an unread notification as read. It will remove the unread notification from the unread count.
  - The unread badge will show when there are unread notifications.
    - It could be a number icon like 1, 2, or 3, or any symbols that can tell users how many unread notifications there are. When all the notifications are read, the number icon should disappear.
    - It could also be a simple red dot on the top-right corner of the notification label in the side bar. When all the notifications are read, the red dot should disappear.

  One thing we didn't discuss is if we should give users the option to mark notifications as read on the unread list page. Probably it is not for the first version because it needs the UI to give a response when this action is taken - the previous unread notification should be removed from the list since it is no longer unread. This will add complexity. We also need to add UIs to choose which notifications to mark as read, which is not what I really want to do currently.

  I also want to confirm the standard on how unread notifications are marked as read. Does it mean the notification is marked as read when the user opens it, like clicking the link to the specific question or reply?

- Yeah I also like the number badge.

  For automatically marking activity as read, what I understand the main point of your recommendation is to check if the unread content is successfully loaded. If it does, we mark it as read.

  For the detail about inbox, I prefer only to show unread notifications because I don't think the read notifications are still useful and would make the inbox full of unnecessary content. The first version is not just simply avoiding any complexity. It should also make sense to user's experience. Can you tell me why you recommend keeping the history? If it makes sense I can also follow your idea.

- Well I think your two practical reasons for keeping history actually make sense. I change my mind and we should follow your suggestion to keep the history. It is possible that users may need to refer back to past notifications.

  I agree with the rest of your explanation.

20. Which course should be the pilot?

    I recommend Introduction to TypeScript, which already exists in the seed data.

21. Who controls whether discussions are enabled?

    I recommend an admin-only setting per course. Disabling discussions makes existing threads read-only; staff can still moderate them.

    - You said staff can still moderate disabled discussions. Does it mean it is only disabled for normal users - students to create or modify, but not for staff - admins and instructors?

    - Since we introduce pilot mode currently, do you think we should add a default global setting for discussions, with enabled/disabled as the options? Currently we can set disabled for all discussions. For individual course, it will have its own setting to enable/disable explicitly, overriding the global setting. In the future, we can change the global setting to enabled. In this way, we can quickly switch from the pilot mode to the production mode in the future. You don't have to agree with this suggestion if you think it is not necessary or if you have a better approach.

    - You said "show the effective state beside inherited settings" and gave an example. If the explicit setting is `enabled` or `disabled`, shall it just show "Enabled" or "Disabled"?

22. Who reviews the pilot, and when?

    I recommend the course’s instructor as the daily review owner, with a review after two weeks covering useful answers, unanswered questions, and instructor workload. Expansion remains a manual decision.

    - In item 22, what do you mean by "Expansion remains a manual decision"?

23. How should inbox entries be organized?

    I recommend one entry per incoming question or reply, newest first, 20 entries per page. Read and unread entries stay together, with unread entries highlighted. Grouping and filters can wait.

24. What should admins see?

    I recommend admins moderate through course discussions and the reports view, without a global Discussion inbox initially. They receive personal Notifications when participating as enrolled students.

    - In item 24, you said "admins moderate through course discussions and the reports view". "Through course discussions" means admins check discussions within each course, doesn't it? Does the "report view" mean the private Reports tab in course management you mentioned in item 25?

25. Where should staff review reports?

    I recommend a private Reports tab in course management, accessible to the course instructor and admins. Students can provide an optional reason; staff can dismiss a report or hide the content.

26. What happens to notifications whose content becomes inaccessible?

    I recommend excluding those entries from the user’s inbox and unread count — for example, after losing course access or when a moderator hides the referenced content. An old link should explain that the content is unavailable.

    - In item 26, does "An old link should explain that the content is unavailable" mean the link to an inaccessible notification should show an error page telling users that the content is unavailable?

27. What happens to unfinished drafts during navigation?

    I recommend preserving drafts while switching between discussion list and detail within the lesson, and warning before leaving the lesson with unsent text. Saving drafts across browser sessions can wait.

    - In item 27, you said "preserving drafts while switching between discussion list and detail within the lesson". Does that mean drafts should be preserved while navigating within the lesson? Where shall it be stored within the lesson navigation, in state management? "warning before leaving the lesson with unsent text" means showing a confirmation prompt before navigating away from the lesson? If user chooses leaving despite the warning, the draft will be lost?

    - What is the browser’s standard unsaved-changes warning you referring to? Is it something that a browser provides automatically for unsaved changes? You mentioned refreshing or closing the tab. By default, those actions won't show any warning. Can we implement something with the browser supported APIs?

28. Should the first version support phones?

    I recommend yes: keep discussion list/detail embedded beneath the lesson and make both inbox links and badges accessible through a mobile menu. The current app has no mobile menu.

    - In item 28, you said we should support mobile view. I checked the mobile view in the app and found it does not have a mobile menu as you said. Do you think implementing mobile view will bring complexity significantly or not?

29. Where should admins change the global default?

    I recommend the Manage Courses page, with each course’s override in its existing Settings tab.

    - You said the Manage Courses page. Here is an example of Manage Courses page from my machine: `http://localhost:5173/instructor/2`. I can see the `Settings` tab where instructors can set up the whole status of a course. I think

    - Let me confirm the admin control for the whole course and individual lessons in a course.

      Here is an example URL of Manage Courses page from my machine: `http://localhost:5173/instructor/2`. I can see the `Settings` tab where instructors can set up the whole status of a course. Here will be the place that admins can change the global default for the course.

      In the individual lesson, there should be a setting too to control the enabled/disabled status for the lesson discussion itself, doesn't it?

      So we're gonna have three places to control discussion status: the app global setting, the course-level setting, and the individual lesson setting. Do I understand this correctly?

30. Should excluded notifications reappear when access or content visibility is restored?

    I recommend yes, preserving their previous read/unread state and original chronological position.

31. Should archiving also pause instructor/admin participation?

    We agreed archived courses are read-only for students. I recommend applying the participation pause to everyone, while retaining staff moderation — consistent with disabled discussions.
