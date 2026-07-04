import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/event
 * Fetches the active event settings. Publicly accessible.
 */
router.get('/', async (req, res) => {
  try {
    let { data: event, error } = await supabase
      .from('event_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    // If no active event exists, seed a default one automatically
    if (!event) {
      const defaultEvent = {
        event_name: 'My Custom Event',
        qr_prefix: 'EVENT',
        starting_number: 1,
        default_max_usage: 1,
        description: 'Welcome to our event QR management platform. Update settings in the admin panel.',
        venue: 'Main Hall',
        event_date: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days out
        contact_details: 'support@event.local',
        is_active: true
      };

      const { data: seeded, error: seedError } = await supabase
        .from('event_settings')
        .insert(defaultEvent)
        .select()
        .single();

      if (seedError) {
        console.error('Failed to seed default event settings:', seedError);
      } else {
        event = seeded;
      }
    }

    return res.json({
      success: true,
      message: 'Event settings retrieved successfully.',
      data: event
    });

  } catch (error) {
    console.error('Error fetching event settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve event settings.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

/**
 * PUT /api/event
 * Updates the active event settings. Admin only.
 */
router.put('/', authenticateToken, requireAdmin, async (req, res) => {
  const {
    event_name,
    qr_prefix,
    starting_number,
    default_max_usage,
    description,
    venue,
    event_date,
    contact_details,
    logo_url
  } = req.body;

  // Validation
  if (!event_name || !qr_prefix) {
    return res.status(400).json({
      success: false,
      message: 'Event Name and QR Prefix are required.',
      errorCode: 'INVALID_PARAMETERS'
    });
  }

  try {
    // Check if the new prefix is already in use by another event settings row
    let { data: activeEvent } = await supabase
      .from('event_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (!activeEvent) {
      return res.status(404).json({
        success: false,
        message: 'No active event settings found to update.',
        errorCode: 'EVENT_NOT_FOUND'
      });
    }

    // Capture old values for audit logging
    const previousSettings = { ...activeEvent };

    // Update settings
    const { data: updatedEvent, error: updateErr } = await supabase
      .from('event_settings')
      .update({
        event_name,
        qr_prefix: qr_prefix.toUpperCase().trim(),
        starting_number: parseInt(starting_number) || 1,
        default_max_usage: parseInt(default_max_usage) || 1,
        description,
        venue,
        event_date,
        contact_details,
        logo_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', activeEvent.id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.code === '23505') {
        return res.status(400).json({
          success: false,
          message: 'The QR Prefix is already in use. Please select a unique prefix.',
          errorCode: 'DUPLICATE_PREFIX'
        });
      }
      throw updateErr;
    }

    // Write audit log
    await supabase.from('audit_logs').insert({
      category: 'config_change',
      actor_id: req.user.id,
      actor_name: req.user.name,
      action: 'update_config',
      target_id: updatedEvent.event_name,
      details: {
        previous: previousSettings,
        updated: updatedEvent
      }
    });

    return res.json({
      success: true,
      message: 'Event settings updated successfully.',
      data: updatedEvent
    });

  } catch (error) {
    console.error('Error updating event settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update event settings.',
      errorCode: 'DATABASE_ERROR'
    });
  }
});

export default router;
