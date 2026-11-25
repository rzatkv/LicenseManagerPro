<?php
/**
 * License Manager Pro — site display controller.
 *
 * The licenses view is for logged-in users only: guests are sent to
 * the Joomla login page with a return URL.
 */

declare(strict_types=1);

namespace Licensemanagerpro\Component\Licensemanagerpro\Site\Controller;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\MVC\Controller\BaseController;
use Joomla\CMS\Router\Route;
use Joomla\CMS\Uri\Uri;

class DisplayController extends BaseController
{
    protected $default_view = 'licenses';

    public function display($cachable = false, $urlparams = []): static
    {
        $app = Factory::getApplication();
        $user = $app->getIdentity();
        if ($user === null || $user->guest) {
            $app->enqueueMessage(Text::_('COM_LICENSMANAGERPRO_LOGIN_REQUIRED'), 'notice');
            $return = base64_encode(Uri::getInstance()->toString());
            $app->redirect(Route::_('index.php?option=com_users&view=login&return=' . $return, false));
            return $this;
        }
        return parent::display($cachable, $urlparams);
    }
}
