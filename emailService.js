const nodemailer = require('nodemailer');
require('dotenv').config({ path: './config.env' });

// Create transporter for sending emails
const createTransporter = () => {
    return nodemailer.createTransporter({
        service: 'gmail', // You can change this to your preferred email service
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        // For development/testing, you can use ethereal email
        // host: 'smtp.ethereal.email',
        // port: 587,
        // secure: false,
        // auth: {
        //     user: 'ethereal.username',
        //     pass: 'ethereal.password'
        // }
    });
};

// Send email notification for scheduled live session
const sendLiveSessionNotification = async (recipientEmail, recipientName, sessionDetails, recipientRole) => {
    try {
        const transporter = createTransporter();
        
        const sessionDate = new Date(sessionDetails.scheduledDateTime);
        const formattedDate = sessionDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = sessionDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const istutor = recipientRole === 'tutor';
        const isRescheduled = sessionDetails.isRescheduled || false;
        
        const subject = isRescheduled
            ? `Live Session Rescheduled: ${sessionDetails.title}`
            : istutor 
                ? `Live Session Scheduled: ${sessionDetails.title}`
                : `New Live Session Available: ${sessionDetails.title}`;

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Live Session Notification</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 3px solid #3b82f6;
                }
                .logo {
                    font-size: 24px;
                    font-weight: bold;
                    color: #3b82f6;
                    margin-bottom: 10px;
                }
                .title {
                    color: #1f2937;
                    font-size: 24px;
                    margin: 0 0 10px 0;
                }
                .session-card {
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .session-title {
                    font-size: 20px;
                    font-weight: bold;
                    margin-bottom: 15px;
                }
                .session-details {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .detail-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .detail-icon {
                    width: 20px;
                    height: 20px;
                    opacity: 0.9;
                }
                .cta-section {
                    text-align: center;
                    margin: 30px 0;
                }
                .cta-button {
                    display: inline-block;
                    background: #10b981;
                    color: white;
                    padding: 12px 30px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    margin: 10px;
                }
                .cta-button:hover {
                    background: #059669;
                }
                .footer {
                    text-align: center;
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 14px;
                }
                .reminder-box {
                    background: #fef3c7;
                    border: 1px solid #f59e0b;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .reminder-title {
                    font-weight: bold;
                    color: #92400e;
                    margin-bottom: 5px;
                }
                .reminder-text {
                    color: #92400e;
                    font-size: 14px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">🎓 Learning Management System</div>
                    <h1 class="title">Live Session ${isRescheduled ? 'Rescheduled' : (istutor ? 'Scheduled' : 'Notification')}</h1>
                </div>

                <p>Dear ${recipientName},</p>
                
                <p>
                    ${isRescheduled 
                        ? 'A live session has been rescheduled. Please note the new date and time below.'
                        : istutor 
                            ? 'Your live session has been successfully scheduled and participants have been notified.'
                            : 'A new live session has been scheduled for a course you are enrolled in.'
                    }
                </p>

                <div class="session-card">
                    <div class="session-title">${sessionDetails.title}</div>
                    <div class="session-details">
                        <div class="detail-item">
                            <span class="detail-icon">📅</span>
                            <span><strong>Date:</strong> ${formattedDate}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">⏰</span>
                            <span><strong>Time:</strong> ${formattedTime}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">⏱️</span>
                            <span><strong>Duration:</strong> ${sessionDetails.duration} minutes</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-icon">👥</span>
                            <span><strong>Max Participants:</strong> ${sessionDetails.maxParticipants}</span>
                        </div>
                        ${sessionDetails.description ? `
                        <div class="detail-item">
                            <span class="detail-icon">📝</span>
                            <span><strong>Description:</strong> ${sessionDetails.description}</span>
                        </div>` : ''}
                    </div>
                </div>

                <div class="reminder-box">
                    <div class="reminder-title">⚠️ Important Reminders:</div>
                    <div class="reminder-text">
                        • Make sure you have a stable internet connection<br>
                        • Test your camera and microphone before the session<br>
                        • Join a few minutes early to avoid any technical issues<br>
                        ${istutor ? '• Prepare your screen sharing materials in advance' : '• Have your questions ready for the tutor'}
                    </div>
                </div>

                <div class="cta-section">
                    <p><strong>Ready to join the session?</strong></p>
                    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/live-session-dashboard" class="cta-button">
                        ${istutor ? 'Manage Sessions' : 'View Sessions'}
                    </a>
                </div>

                <p>
                    ${istutor 
                        ? 'You can start the session when it\'s time by clicking the "Start Session" button in your dashboard.'
                        : 'When the session starts, you\'ll be able to join directly from the course page or your dashboard.'
                    }
                </p>

                <div class="footer">
                    <p>If you have any questions or need assistance, please contact our support team.</p>
                    <p>&copy; 2025 Learning Management System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const textContent = `
        Dear ${recipientName},

        ${istutor 
            ? 'Your live session has been successfully scheduled and participants have been notified.'
            : 'A new live session has been scheduled for a course you are enrolled in.'
        }

        Session Details:
        - Title: ${sessionDetails.title}
        - Date: ${formattedDate}
        - Time: ${formattedTime}
        - Duration: ${sessionDetails.duration} minutes
        - Max Participants: ${sessionDetails.maxParticipants}
        ${sessionDetails.description ? `- Description: ${sessionDetails.description}` : ''}

        Important Reminders:
        • Make sure you have a stable internet connection
        • Test your camera and microphone before the session
        • Join a few minutes early to avoid any technical issues
        ${istutor ? '• Prepare your screen sharing materials in advance' : '• Have your questions ready for the tutor'}

        ${istutor 
            ? 'You can start the session when it\'s time by clicking the "Start Session" button in your dashboard.'
            : 'When the session starts, you\'ll be able to join directly from the course page or your dashboard.'
        }

        Best regards,
        Learning Management System Team
        `;

        const mailOptions = {
            from: `"LMS Notifications" <${process.env.EMAIL_USER}>`,
            to: recipientEmail,
            subject: subject,
            text: textContent,
            html: htmlContent
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Live session notification email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };

    } catch (error) {
        console.error('Error sending live session notification email:', error);
        return { success: false, error: error.message };
    }
};

// Send reminder email before session starts (optional feature)
const sendSessionReminder = async (recipientEmail, recipientName, sessionDetails, minutesBefore = 30) => {
    try {
        const transporter = createTransporter();
        
        const sessionDate = new Date(sessionDetails.scheduledDateTime);
        const formattedTime = sessionDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const mailOptions = {
            from: `"LMS Reminders" <${process.env.EMAIL_USER}>`,
            to: recipientEmail,
            subject: `Reminder: Live Session "${sessionDetails.title}" starts in ${minutesBefore} minutes`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #f59e0b;">🔔 Session Reminder</h2>
                <p>Hi ${recipientName},</p>
                <p>This is a friendly reminder that your live session "<strong>${sessionDetails.title}</strong>" starts in <strong>${minutesBefore} minutes</strong> at <strong>${formattedTime}</strong>.</p>
                <p>Make sure you're ready to join!</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/live-session-dashboard" 
                   style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">
                   Join Session
                </a>
            </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Session reminder email sent successfully:', result.messageId);
        return { success: true, messageId: result.messageId };

    } catch (error) {
        console.error('Error sending session reminder email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendLiveSessionNotification,
    sendSessionReminder
};